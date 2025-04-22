// db.ts
import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGO_URI || "mongodb://localhost:27017/tabsera";

const client = new MongoClient(uri);
let db: Db;

export async function connectToDB(): Promise<Db> {
  if (!db) {
    await client.connect();
    console.log("Mongo URI:", process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");
    db = client.db(); // default to 'analytics'
  }
  return db;
}
