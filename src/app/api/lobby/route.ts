import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

interface Signal {
  id: string;
  from: string;
  to: string;
  type: string;
  payload: string;
  timestamp: number;
}

interface Participant {
  userId: string;
  username: string;
  lastSeen: number;
}

interface LobbySession {
  instanceId: string;
  updatedAt: number;
  participants: Participant[];
  signals: Signal[];
}

// In-memory mock database fallback for local dev when MongoDB is not connected
const mockLobbies: Record<string, LobbySession> = {};

export async function POST(req: Request) {
  try {
    const { instanceId, userId, username, signals: incomingSignals } = await req.json();

    if (!instanceId || !userId || !username) {
      return NextResponse.json(
        { error: "Missing required parameters: instanceId, userId, or username" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const activeThreshold = now - 20000; // Active within past 20s
    const signalExpiry = now - 30000;    // Signals expire after 30s

    // Normalize incoming signals to have IDs and timestamps
    const preparedSignals: Signal[] = (incomingSignals || []).map((sig: any) => ({
      id: sig.id || `sig-${now}-${Math.random().toString(36).substr(2, 9)}`,
      from: userId,
      to: sig.to,
      type: sig.type,
      payload: sig.payload,
      timestamp: now,
    }));

    if (!clientPromise) {
      if (process.env.NODE_ENV !== "development") {
        return NextResponse.json(
          { error: "Database configuration is missing. Please contact the administrator." },
          { status: 500 }
        );
      }

      // Initialize mock lobby if not exists
      if (!mockLobbies[instanceId]) {
        mockLobbies[instanceId] = {
          instanceId,
          updatedAt: now,
          participants: [],
          signals: [],
        };
      }

      const lobby = mockLobbies[instanceId];

      // Update/insert current user
      const partIndex = lobby.participants.findIndex((p) => p.userId === userId);
      if (partIndex > -1) {
        lobby.participants[partIndex].lastSeen = now;
        lobby.participants[partIndex].username = username;
      } else {
        lobby.participants.push({ userId, username, lastSeen: now });
      }

      // Append incoming signals
      lobby.signals.push(...preparedSignals);

      // Filter out inactive participants and expired signals
      lobby.participants = lobby.participants.filter((p) => p.lastSeen > activeThreshold);
      lobby.signals = lobby.signals.filter((s) => s.timestamp > signalExpiry);

      // Collect signals for THIS user
      const userSignals = lobby.signals.filter((s) => s.to === userId);

      // Consume/remove these signals from the mock store
      lobby.signals = lobby.signals.filter((s) => s.to !== userId);

      lobby.updatedAt = now;

      return NextResponse.json({
        participants: lobby.participants,
        signals: userSignals,
        mocked: true,
      });
    }

    // --- MONGODB IMPLEMENTATION ---
    const client = await clientPromise;
    const db = client.db("givewars2");
    const collection = db.collection("lobby_sessions");

    // 1. Ensure document exists and update user heartbeat + add new signals
    await collection.updateOne(
      { instanceId },
      {
        $set: { updatedAt: new Date(now) },
        // Append signals to the array
        $push: {
          signals: {
            $each: preparedSignals,
          },
        },
      } as any,
      { upsert: true }
    );

    // 2. Manage participant heartbeat inside the array atomically
    // To do this reliably, we first pull the participant if they exist, then push them with the new timestamp.
    // This avoids duplicated entries.
    await collection.updateOne(
      { instanceId },
      {
        $pull: {
          participants: { userId: userId } as any,
        },
      } as any
    );

    await collection.updateOne(
      { instanceId },
      {
        $push: {
          participants: {
            userId,
            username,
            lastSeen: now,
          },
        },
      } as any
    );

    // 3. Clean up expired signals & inactive participants, and fetch the lobby document
    // We do this by pulling stale items from the database document
    await collection.updateOne(
      { instanceId },
      {
        $pull: {
          participants: { lastSeen: { $lt: activeThreshold } } as any,
          signals: { timestamp: { $lt: signalExpiry } } as any,
        },
      } as any
    );

    const doc = await collection.findOne({ instanceId });

    if (!doc) {
      return NextResponse.json({ participants: [], signals: [] });
    }

    const participants: Participant[] = doc.participants || [];
    const allSignals: Signal[] = doc.signals || [];

    // Filter signals intended for the current user
    const userSignals = allSignals.filter((sig) => sig.to === userId);

    // 4. Consume/delete signals sent to this user so they don't retrieve them again
    if (userSignals.length > 0) {
      await collection.updateOne(
        { instanceId },
        {
          $pull: {
            signals: { to: userId } as any,
          },
        }
      );
    }

    return NextResponse.json({
      participants,
      signals: userSignals,
    });
  } catch (error) {
    console.error("Lobby API POST endpoint error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
