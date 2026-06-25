const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const uri = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ─── JWT MIDDLEWARE ───────────────────────────────────────────────────────────
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ message: "Unauthorized: no token" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized: invalid token" });
  }
};

const verifyAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden: admin only" });
  next();
};

async function run() {
  try {
    const db = client.db("startup-frontier-db");
    const startupsCollection = db.collection("startups");
    const featuredStartupsCollection = db.collection("featured-startups");
    const opportunitiesCollection = db.collection("opportunities");
    const usersCollection = db.collection("user");
    const applicationsCollection = db.collection("applications");
    const paymentCollection = db.collection("payments");

    // Called from the client after Better Auth login succeeds
    app.post("/api/auth/token", (req, res) => {
      const { email, role } = req.body;
      if (!email) return res.status(400).json({ message: "email required" });
      const token = jwt.sign({ email, role }, JWT_SECRET, { expiresIn: "7d" });
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.json({ success: true });
    });

    // Clear JWT cookie on logout
    app.post("/api/auth/logout", (req, res) => {
      res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      });
      res.json({ success: true });
    });

    // PUBLIC ROUTES

    // Get all startups with filters
    app.get("/api/startups", async (req, res) => {
      const { featured, limit, search, industry, fundingStage } = req.query;
      const filter = {};
      if (industry) filter.industry = industry;
      if (fundingStage) filter.fundingStage = fundingStage;
      if (search) {
        filter.$or = [
          { startupName: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { industry: { $regex: search, $options: "i" } },
        ];
      }
      if (featured === "true") {
        let query = featuredStartupsCollection.find(filter).sort({ createdAt: -1 });
        if (limit) query = query.limit(parseInt(limit));
        return res.json(await query.toArray());
      }
      const [real, showcase] = await Promise.all([
        startupsCollection.find(filter).sort({ createdAt: -1 }).toArray(),
        featuredStartupsCollection.find(filter).sort({ createdAt: -1 }).toArray(),
      ]);
      let result = [...real, ...showcase];
      if (limit) result = result.slice(0, parseInt(limit));
      res.json(result);
    });

    app.get("/api/featured-startups", async (req, res) => {
      const { limit } = req.query;
      let query = featuredStartupsCollection.find({}).sort({ createdAt: -1 });
      if (limit) query = query.limit(parseInt(limit));
      res.json(await query.toArray());
    });

    app.get("/api/startups/:id", async (req, res) => {
      try {
        const oid = new ObjectId(req.params.id);
        let result = await startupsCollection.findOne({ _id: oid });
        if (!result) result = await featuredStartupsCollection.findOne({ _id: oid });
        res.json(result);
      } catch {
        res.status(400).json({ error: "Invalid ID" });
      }
    });

    // Browse opportunities (public — needed for home page + collaborator browse)
    app.get("/api/opportunities", async (req, res) => {
      const { search, workType, industry, page = 1, limit = 9 } = req.query;
      const filter = {};
      if (search) {
        filter.$or = [
          { roleTitle: { $regex: search, $options: "i" } },
          { requiredSkills: { $regex: search, $options: "i" } },
        ];
      }
      if (workType) filter.workType = { $in: workType.split(",") };
      if (industry) filter.industry = { $in: industry.split(",") };

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.max(1, parseInt(limit));
      const [data, total] = await Promise.all([
        opportunitiesCollection.find(filter).sort({ _id: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).toArray(),
        opportunitiesCollection.countDocuments(filter),
      ]);
      res.json({ data, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
    });

    app.get("/api/opportunities/detail/:id", async (req, res) => {
      try {
        res.json(await opportunitiesCollection.findOne({ _id: new ObjectId(req.params.id) }));
      } catch {
        res.status(400).json({ error: "Invalid ID" });
      }
    });

    // PROTECTED ROUTES with JWT

    // Founder: get startup by email
    app.get("/api/founder/:email", async (req, res) => {
      console.log("[GET /api/founder] querying founderEmail:", req.params.email);
      const result = await startupsCollection.findOne({ founderEmail: req.params.email });
      res.json(result);
    });

    // Founder: create startup
    app.post("/api/founder", verifyToken, async (req, res) => {
      try {
        const { startupName, logoUrl, industry, description, fundingStage, founderEmail, teamSize, teamSizeNeeded } = req.body;
        if (!founderEmail) return res.status(400).json({ error: "founderEmail is required" });
        const result = await startupsCollection.insertOne({
          startupName, logoUrl, industry, description, fundingStage, founderEmail,
          teamSizeNeeded: teamSizeNeeded || teamSize || null,
          createdAt: new Date(), status: "pending",
        });
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Founder: update startup
    app.patch("/api/founder/:id", verifyToken, async (req, res) => {
      try {
        const { startupName, logoUrl, industry, description, fundingStage, founderEmail, teamSize, teamSizeNeeded } = req.body;
        const result = await startupsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { startupName, logoUrl, industry, description, fundingStage, founderEmail, teamSizeNeeded: teamSizeNeeded || teamSize || null } }
        );
        res.json(result);
      } catch {
        res.status(400).json({ error: "Invalid ID" });
      }
    });

    // Founder: delete startup
    app.delete("/api/founder/:id", verifyToken, async (req, res) => {
      try {
        res.json(await startupsCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
      } catch {
        res.status(400).json({ error: "Invalid ID" });
      }
    });

    // Opportunities: post (founder only)
    app.post("/api/opportunities", verifyToken, async (req, res) => {
      const data = req.body;
      const user = await usersCollection.findOne({ email: data?.founderEmail });
      const count = await opportunitiesCollection.countDocuments({ founderEmail: data?.founderEmail });
      if (!user?.isPremium && count >= 3) {
        return res.status(403).json({ message: "Your free limit is over. Upgrade to premium to post more opportunities." });
      }
      res.json(await opportunitiesCollection.insertOne({ ...data }));
    });

    // Opportunities: by founder email
    app.get("/api/opportunities/:email", verifyToken, async (req, res) => {
      res.json(await opportunitiesCollection.find({ founderEmail: req.params.email }).toArray());
    });

    // Opportunities: update
    app.patch("/api/opportunities/:id", verifyToken, async (req, res) => {
      try {
        res.json(await opportunitiesCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { ...req.body } }));
      } catch {
        res.status(400).json({ error: "Invalid ID" });
      }
    });

    // Opportunities: delete
    app.delete("/api/opportunities/:id", verifyToken, async (req, res) => {
      try {
        res.json(await opportunitiesCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
      } catch {
        res.status(400).json({ error: "Invalid ID" });
      }
    });

    // Applications: submit
    app.post("/api/applications", verifyToken, async (req, res) => {
      res.json(await applicationsCollection.insertOne({ ...req.body, createdAt: new Date(), status: "pending" }));
    });

    // Applications: by founder
    app.get("/api/applications/founder/:email", verifyToken, async (req, res) => {
      res.json(await applicationsCollection.find({ founderEmail: req.params.email }).sort({ createdAt: -1 }).toArray());
    });

    // Applications: by applicant
    app.get("/api/applications/applicant/:email", verifyToken, async (req, res) => {
      res.json(await applicationsCollection.find({ applicantEmail: req.params.email }).sort({ createdAt: -1 }).toArray());
    });

    // Applications: update status
    app.patch("/api/applications/:id", verifyToken, async (req, res) => {
      try {
        res.json(await applicationsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: req.body.status } }));
      } catch {
        res.status(400).json({ error: "Invalid ID" });
      }
    });

    // Premium upgrade
    app.patch("/api/users/upgrade-premium/:email", verifyToken, async (req, res) => {
      try {
        const { email } = req.params;
        const { transactionId, paymentStatus, paymentType, amount, userEmail } = req.body;
        const userUpdate = await usersCollection.updateOne({ email }, { $set: { isPremium: true, premiumSince: new Date() } });
        const paymentRecord = { userEmail: userEmail || email, transactionId, paymentStatus, paymentType, amount, paidAt: new Date() };
        await paymentCollection.insertOne(paymentRecord);
        res.json({ success: true, userUpdate, paymentRecord });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // User profile: get
    app.get("/api/users/profile/:email", verifyToken, async (req, res) => {
      const user = await usersCollection.findOne({ email: req.params.email }, { projection: { name: 1, email: 1, image: 1, skills: 1, bio: 1 } });
      res.json(user);
    });

    // User profile: update
    app.patch("/api/users/profile/:email", verifyToken, async (req, res) => {
      const { name, image, skills, bio } = req.body;
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (image !== undefined) updateData.image = image;
      if (skills !== undefined) updateData.skills = skills;
      if (bio !== undefined) updateData.bio = bio;
      res.json(await usersCollection.updateOne({ email: req.params.email }, { $set: updateData }));
    });

    // ADMIN ROUTES require JWT and admin role 

    app.get("/api/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const [totalUsers, totalStartups, totalOpportunities, payments] = await Promise.all([
          usersCollection.countDocuments(),
          startupsCollection.countDocuments(),
          opportunitiesCollection.countDocuments(),
          paymentCollection.find({}, { projection: { amount: 1 } }).toArray(),
        ]);
        const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        res.json({ totalUsers, totalStartups, totalOpportunities, totalRevenue });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/admin/users", verifyToken, verifyAdmin, async (req, res) => {
      try {
        res.json(await usersCollection.find({}, { projection: { name: 1, email: 1, image: 1, role: 1, isPremium: 1, createdAt: 1 } }).sort({ createdAt: -1 }).toArray());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.patch("/api/admin/users/block/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        res.json(await usersCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { isBlocked: true } }));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    app.patch("/api/admin/users/unblock/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        res.json(await usersCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { isBlocked: false } }));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    app.get("/api/admin/startups", verifyToken, verifyAdmin, async (req, res) => {
      try {
        res.json(await startupsCollection.find({}).sort({ createdAt: -1 }).toArray());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.patch("/api/admin/startups/approve/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        res.json(await startupsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { approved: true } }));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    app.delete("/api/admin/startups/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        res.json(await startupsCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    app.get("/api/admin/transactions", verifyToken, verifyAdmin, async (req, res) => {
      try {
        res.json(await paymentCollection.find({}).sort({ paidAt: -1 }).toArray());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    console.log("Connected to MongoDB successfully!");
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

// ─── STRIPE CHECKOUT ──────────────────────────────────────────────────────────
const Stripe = require("stripe");

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const { userEmail, origin } = req.body;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      customer_email: userEmail,
      line_items: [{ price: "price_1Tm50l1M1Z0gAaXRyn6q5twY", quantity: 1 }],
      mode: "subscription",
      success_url: `${origin}/dashboard/founder/premium-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel?session_id={CHECKOUT_SESSION_ID}`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post("/api/retrieve-checkout-session", async (req, res) => {
  try {
    const { session_id } = req.body;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["line_items", "payment_intent"],
    });
    res.json(session);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.get("/", (req, res) => {
  res.send("Startup Frontier API is running!");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
