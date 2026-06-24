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
    const opportunitiesCollection = db.collection("opportunities");
    const applicationsCollection = db.collection("applications");
    const paymentCollection = db.collection("payments");

    // Get all startups with optional filters
    app.get("/api/startups", async (req, res) => {
      const { featured, limit, search, industry, fundingStage } = req.query;
      const filter = {};
      if (featured === "true") filter.featured = true;
      if (industry) filter.industry = industry;
      if (fundingStage) filter.fundingStage = fundingStage;
      if (search) {
        filter.$or = [
          { startupName: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { industry: { $regex: search, $options: "i" } },
        ];
      }
      let query = startupsCollection.find(filter).sort({ createdAt: -1 });
      if (limit) query = query.limit(parseInt(limit));
      const result = await query.toArray();
      res.json(result);
    });

    // Get a single startup by ID
    app.get("/api/startups/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await startupsCollection.findOne({ _id: new ObjectId(id) });
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: "Invalid ID" });
      }
    });

    // Get founder's startup by email
    app.get("/api/founder/:email", async (req, res) => {
      const { email } = req.params;
      const result = await startupsCollection.findOne({ founderEmail: email });
      res.json(result);
    });

    // Create a startup
    app.post("/api/founder", async (req, res) => {
      const { startupName, logoUrl, industry, description, fundingStage, founderEmail, teamSize } = req.body;
      const addData = {
        startupName,
        logoUrl,
        industry,
        description,
        fundingStage,
        founderEmail,
        teamSize: teamSize || null,
        createdAt: new Date(),
        status: "pending",
      };
      const result = await startupsCollection.insertOne(addData);
      res.json(result);
    });

    // Update a startup
    app.patch("/api/founder/:id", async (req, res) => {
      const { id } = req.params;
      const { startupName, logoUrl, industry, description, fundingStage, founderEmail, teamSize } = req.body;
      const updateData = {
        startupName,
        logoUrl,
        industry,
        description,
        fundingStage,
        founderEmail,
        teamSize: teamSize || null,
      };
      try {
        const result = await startupsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
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
        const result = await startupsCollection.deleteOne({ _id: new ObjectId(id) });
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
          { $set: { status } }
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
