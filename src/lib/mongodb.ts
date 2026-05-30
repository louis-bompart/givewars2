import { MongoClient } from "mongodb";

const uri = process.env.MONGO_MONGODB_URI || process.env.MONGODB_URI;

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

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
      globalWithMongo._mongoClientPromise = client.connect();
    }
    clientPromise = globalWithMongo._mongoClientPromise;
  } else {
    // In production mode, it's best to not use a global variable.
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }
} else {
  console.warn(
    "WARNING: MONGO_MONGODB_URI or MONGODB_URI environment variable is missing or placeholder. The application will use an in-memory/mock database fallback."
  );
}

export default clientPromise;
