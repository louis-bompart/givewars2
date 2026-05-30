import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { encrypt, decrypt } from "@/lib/crypto";

// In-memory mock database fallback for local dev when MongoDB is not connected
const mockDbKeys: Record<string, string> = {
  // Mock entries for testing, pre-encrypted to keep logic unified
  "101": encrypt("E43E43CC-AF41-004F-8492-7874CE662AE170CD6B30-A351-4394-8662-7F333E741323"), // Commander Logan's mock key
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Missing 'userId' parameter" }, { status: 400 });
    }

    // Check if MongoDB client is available
    if (!clientPromise) {
      console.warn(`[Mock DB] Fetching and decrypting GW2 API Key for Discord user: ${userId}`);
      const rawEncrypted = mockDbKeys[userId] || "";
      const apiKey = decrypt(rawEncrypted);
      return NextResponse.json({ apiKey, mocked: true });
    }

    const client = await clientPromise;
    const db = client.db("givewars2");
    
    const userDoc = await db.collection("gw2_keys").findOne({ discordUserId: userId });

    const apiKey = userDoc && userDoc.gw2ApiKey ? decrypt(userDoc.gw2ApiKey) : "";

    return NextResponse.json({
      apiKey,
    });
  } catch (error) {
    console.error("API Key GET endpoint error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId, username, apiKey } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "Missing 'userId' parameter" }, { status: 400 });
    }

    // 1. Verify key with Guild Wars 2 official API first (if not clearing/empty)
    const trimmedKey = apiKey ? apiKey.trim() : "";
    
    if (trimmedKey) {
      try {
        const gw2Res = await fetch(`https://api.guildwars2.com/v2/account?access_token=${trimmedKey}`);
        if (!gw2Res.ok) {
          return NextResponse.json(
            { error: "Invalid Guild Wars 2 API Key. Verification failed." },
            { status: 400 }
          );
        }
      } catch (err) {
        console.error("GW2 API Key verification request failed:", err);
        return NextResponse.json(
          { error: "Could not contact Guild Wars 2 API to verify key. Please try again." },
          { status: 500 }
        );
      }
    }

    // 2. Encrypt the verified key before storing it
    const securedKey = trimmedKey ? encrypt(trimmedKey) : "";

    // 3. Persist in database (or mock fallback)
    if (!clientPromise) {
      console.warn(`[Mock DB] Encrypting and saving GW2 API Key for Discord user: ${userId} (${username})`);
      mockDbKeys[userId] = securedKey;
      return NextResponse.json({ success: true, apiKey: trimmedKey, mocked: true });
    }

    const client = await clientPromise;
    const db = client.db("givewars2");

    await db.collection("gw2_keys").updateOne(
      { discordUserId: userId },
      {
        $set: {
          discordUserId: userId,
          discordUsername: username || "",
          gw2ApiKey: securedKey,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true, apiKey: trimmedKey });
  } catch (error) {
    console.error("API Key POST endpoint error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Missing 'userId' parameter" }, { status: 400 });
    }

    // Handle mock database flush
    if (!clientPromise) {
      console.warn(`[Mock DB] Permanently purging data for Discord user: ${userId}`);
      delete mockDbKeys[userId];
      return NextResponse.json({ success: true, mocked: true });
    }

    const client = await clientPromise;
    const db = client.db("givewars2");

    // Permanently delete the user document
    const deleteResult = await db.collection("gw2_keys").deleteOne({ discordUserId: userId });
    
    console.log(`[Database] Flushed user data for ${userId}. Deleted documents count: ${deleteResult.deletedCount}`);

    return NextResponse.json({ success: true, deletedCount: deleteResult.deletedCount });
  } catch (error) {
    console.error("API Key DELETE endpoint error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
