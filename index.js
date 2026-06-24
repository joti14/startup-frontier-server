const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
const app = express();
const port = process.env.PORT;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("startup-frontier-db");
    const startupsCollection = db.collection("startups");
    const featuredStartupsCollection = db.collection("featured-startups");
    const opportunitiesCollection = db.collection("opportunities");
    const usersCollection = db.collection("user");
    const applicationsCollection = db.collection("applications");
    const paymentCollection = db.collection("payments");

    // Get all startups with filters
    app.get("/api/startups", async (req, res) => {
      const { featured, limit, search, industry, fundingStage } = req.query;
      const collection =
        featured === "true" ? featuredStartupsCollection : startupsCollection;
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
      let query = collection.find(filter).sort({ createdAt: -1 });
      if (limit) query = query.limit(parseInt(limit));
      const result = await query.toArray();
      res.json(result);
    });

    // Get all featured startups (separate collection)
    app.get("/api/featured-startups", async (req, res) => {
      const { limit } = req.query;
      let query = featuredStartupsCollection.find({}).sort({ createdAt: -1 });
      if (limit) query = query.limit(parseInt(limit));
      const result = await query.toArray();
      res.json(result);
    });

    // Get a single startup by ID (checks real startups first, then featured)
    app.get("/api/startups/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const oid = new ObjectId(id);
        let result = await startupsCollection.findOne({ _id: oid });
        if (!result)
          result = await featuredStartupsCollection.findOne({ _id: oid });
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: "Invalid ID" });
      }
    });

    // Get founder's startup by email
    app.get("/api/founder/:email", async (req, res) => {
      const { email } = req.params;
      console.log("[GET /api/founder] querying founderEmail:", email);
      const result = await startupsCollection.findOne({ founderEmail: email });
      console.log("[GET /api/founder] result:", result ? result._id : "null");
      res.json(result);
    });

    // Create a startup
    app.post("/api/founder", async (req, res) => {
      try {
        console.log("[POST /api/founder] body:", req.body);
        const {
          startupName,
          logoUrl,
          industry,
          description,
          fundingStage,
          founderEmail,
          teamSize,
          teamSizeNeeded,
        } = req.body;
        if (!founderEmail) {
          return res.status(400).json({ error: "founderEmail is required" });
        }
        const addData = {
          startupName,
          logoUrl,
          industry,
          description,
          fundingStage,
          founderEmail,
          teamSizeNeeded: teamSizeNeeded || teamSize || null,
          createdAt: new Date(),
          status: "pending",
        };
        console.log("[POST /api/founder] inserting:", addData);
        const result = await startupsCollection.insertOne(addData);
        console.log("[POST /api/founder] inserted:", result.insertedId);
        res.json(result);
      } catch (err) {
        console.error("[POST /api/founder] error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Update a startup
    app.patch("/api/founder/:id", async (req, res) => {
      const { id } = req.params;
      const {
        startupName,
        logoUrl,
        industry,
        description,
        fundingStage,
        founderEmail,
        teamSize,
        teamSizeNeeded,
      } = req.body;
      const updateData = {
        startupName,
        logoUrl,
        industry,
        description,
        fundingStage,
        founderEmail,
        teamSizeNeeded: teamSizeNeeded || teamSize || null,
      };
      try {
        const result = await startupsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData },
        );
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: "Invalid ID" });
      }
    });

    // Delete a startup
    app.delete("/api/founder/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await startupsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: "Invalid ID" });
      }
    });

    // Add an opportunity (free limit: 3 per founder)
    app.post("/api/opportunities", async (req, res) => {
      const data = req.body;
      const user = await usersCollection.findOne({ email: data?.founderEmail });
      const count = await opportunitiesCollection.countDocuments({
        founderEmail: data?.founderEmail,
      });
      if (!user?.isPremium && count >= 3) {
        return res
          .status(403)
          .json({
            message:
              "Your free limit is over. Upgrade to premium to post more opportunities.",
          });
      }
      const result = await opportunitiesCollection.insertOne({ ...data });
      res.json(result);
    });

    // Get latest opportunities (with search and filters)
    app.get("/api/opportunities", async (req, res) => {
      const { limit, search, workType, industry } = req.query;
      const filter = {};

      if (search) {
        filter.$or = [
          { roleTitle: { $regex: search, $options: "i" } },
          { requiredSkills: { $regex: search, $options: "i" } },
        ];
      }

      if (workType) {
        const workTypes = workType.split(",");
        filter.workType = { $in: workTypes };
      }

      if (industry) {
        const industries = industry.split(",");
        filter.industry = { $in: industries };
      }

      let query = opportunitiesCollection.find(filter).sort({ _id: -1 });
      if (limit) query = query.limit(parseInt(limit));
      const result = await query.toArray();
      res.json(result);
    });

    // Get opportunities by founder email
    app.get("/api/opportunities/:email", async (req, res) => {
      const { email } = req.params;
      const result = await opportunitiesCollection
        .find({ founderEmail: email })
        .toArray();
      res.json(result);
    });

    // Update an opportunity
    app.patch("/api/opportunities/:id", async (req, res) => {
      const { id } = req.params;
      const data = req.body;
      try {
        const result = await opportunitiesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { ...data } },
        );
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: "Invalid ID" });
      }
    });

    // Delete an opportunity
    app.delete("/api/opportunities/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await opportunitiesCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: "Invalid ID" });
      }
    });

    // Submit an application
    app.post("/api/applications", async (req, res) => {
      const data = req.body;
      console.log("[POST /api/applications] Received:", data);
      const result = await applicationsCollection.insertOne({
        ...data,
        createdAt: new Date(),
        status: "pending",
      });
      console.log("[POST /api/applications] Inserted:", result.insertedId);
      res.json(result);
    });

    // Get all applications for a founder (by founder email)
    app.get("/api/applications/founder/:email", async (req, res) => {
      const { email } = req.params;
      console.log("[GET /api/applications/founder] email:", email);
      const result = await applicationsCollection
        .find({ founderEmail: email })
        .sort({ createdAt: -1 })
        .toArray();
      console.log("[GET /api/applications/founder] found:", result.length);
      res.json(result);
    });

    // Get all applications for an applicant (by applicant email)
    app.get("/api/applications/applicant/:email", async (req, res) => {
      const { email } = req.params;
      console.log("[GET /api/applications/applicant] email:", email);
      const result = await applicationsCollection
        .find({ applicantEmail: email })
        .sort({ createdAt: -1 })
        .toArray();
      console.log("[GET /api/applications/applicant] found:", result.length);
      res.json(result);
    });

    // Update application status (Accept / Reject)
    app.patch("/api/applications/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      try {
        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } },
        );
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: "Invalid ID" });
      }
    });

    console.log("Connected to MongoDB successfully!");
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Startup Frontier API is running!");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
