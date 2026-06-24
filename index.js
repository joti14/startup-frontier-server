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
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    const db = client.db("startup-frontier-db");
    const startupsCollection = db.collection("startups");
    const opportunitiesCollection = db.collection("opportunities");
    const applicationsCollection = db.collection("applications");
    const paymentCollection = db.collection("payments");

    // featured startups, filter and search
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

    // Founder related APIs
    app.get("/api/founder/:email", async (req, res) => {
      const { email } = req.params;
      const result = await startupsCollection.findOne({ founderEmail: email });
      res.send(result);
    });

    app.post("/api/founder", async (req, res) => {
      const {
        startupName,
        logoUrl,
        industry,
        description,
        fundingStage,
        founderEmail,
      } = req.body;

      const addData = {
        startupName,
        logoUrl,
        industry,
        description,
        fundingStage,
        founderEmail,
        createdAt: new Date(),
        status: "active",
      };

      const result = await startupsCollection.insertOne(addData);
      res.json(result);
    });

    app.patch("/api/founder/:id", async (req, res) => {
      const { id } = req.params;
      const {
        startupName,
        logoUrl,
        industry,
        description,
        fundingStage,
        founderEmail,
      } = req.body;

      const updateData = {
        startupName,
        logoUrl,
        industry,
        description,
        fundingStage,
        founderEmail,
        createdAt: new Date(),
        status: "active",
      };

      const result = await startupsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            ...updateData,
          },
        },
      );
      res.json(result);
    });

    app.delete("/api/founder/:id", async (req, res) => {
      const { id } = req.params;
      const result = await startupsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.json(result);
    });

    // add oportunity
    app.post("/api/opportunities", async (req, res) => {
      const data = req.body;
      const result = await opportunitiesCollection.insertOne({
        ...data,
      });
      res.send(result);
    });

    // manage opportunities
    app.get("/api/opportunities/:email", async (req, res) => {
      const { email } = req.params;
      const result = await opportunitiesCollection
        .find({ founderEmail: email })
        .toArray();
      res.json(result);
    });

    app.patch("/api/opportunities/:id", async (req, res) => {
      const { id } = req.params;
      const data = req.body;
      const result = await opportunitiesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { ...data } },
      );
      res.json(result);
    });

    app.delete("/api/opportunities/:id", async (req, res) => {
      const { id } = req.params;
      const result = await opportunitiesCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.json(result);
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
