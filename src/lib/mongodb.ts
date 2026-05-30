import { MongoClient } from "mongodb";

const uri = process.env.MONGO_MONGODB_URI || process.env.MONGODB_URI;

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

async function setupIndexes(clientInstance: MongoClient) {
  try {
    const db = clientInstance.db("givewars2");
    // Create TTL Index on updatedAt: expire after 1 day (86400 seconds)
    await db.collection("lobby_sessions").createIndex(
      { updatedAt: 1 },
      { expireAfterSeconds: 86400 }
    );
    console.log("MongoDB: TTL index on lobby_sessions.updatedAt verified/created.");
  } catch (error) {
    console.error("MongoDB: Failed to create TTL index:", error);
  }
}

if (uri && !uri.includes("TODO_REPLACE_WITH")) {
  const options = {};

  if (process.env.NODE_ENV === "development") {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    const globalWithMongo = global as typeof globalThis & {
      _mongoClientPromise?: Promise<MongoClient>;
    };

    if (!globalWithMongo._mongoClientPromise) {
      client = new MongoClient(uri, options);
      globalWithMongo._mongoClientPromise = client.connect().then(async (c) => {
        await setupIndexes(c);
        return c;
      });
    }
    clientPromise = globalWithMongo._mongoClientPromise;
  } else {
    // In production mode, it's best to not use a global variable.
    client = new MongoClient(uri, options);
    clientPromise = client.connect().then(async (c) => {
      await setupIndexes(c);
      return c;
    });
  }
} else {
  console.warn(
    "WARNING: MONGO_MONGODB_URI or MONGODB_URI environment variable is missing or placeholder. The application will use an in-memory/mock database fallback."
  );
}

export default clientPromise;
