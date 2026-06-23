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
