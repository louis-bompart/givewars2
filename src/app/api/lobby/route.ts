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
  queue?: any[];
  roll?: number | null;
  hasItem?: boolean | null;
}

interface LobbySession {
  instanceId: string;
  updatedAt: number;
  participants: Participant[];
  signals: Signal[];
  guildId?: string;
  guildName?: string;
  isDiscordActivity?: boolean;
  activeItem?: any;
  activeItemOwner?: string | null;
}

// In-memory mock database fallback for local dev when MongoDB is not connected
const mockLobbies: Record<string, LobbySession> = {};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const guildId = searchParams.get("guildId");

    if (!guildId) {
      return NextResponse.json(
        { error: "Missing required parameter: guildId" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const activeThreshold = now - 20000; // Active within past 20s

    if (!clientPromise) {
      // Mock mode active lobbies filtered by guildId and recent activity
      const active = Object.values(mockLobbies)
        .filter(
          (l) =>
            l.guildId === guildId &&
            l.updatedAt > activeThreshold &&
            l.participants.length > 0
        )
        .map((l) => ({
          instanceId: l.instanceId,
          guildId: l.guildId,
          guildName: l.guildName,
          isDiscordActivity: l.isDiscordActivity,
          updatedAt: l.updatedAt,
          participantCount: l.participants.length,
          organizer: l.participants[0]?.username || "Unknown",
        }));
      return NextResponse.json({ lobbies: active });
    }

    // --- MONGODB IMPLEMENTATION ---
    const client = await clientPromise;
    const db = client.db("givewars2");
    const collection = db.collection("lobby_sessions");

    const activeLobbiesCursor = collection.find({
      guildId,
      updatedAt: { $gt: new Date(activeThreshold) },
      "participants.0": { $exists: true }, // Ensure at least 1 participant
    });

    const lobbiesList = await activeLobbiesCursor.toArray();
    const active = lobbiesList.map((doc) => ({
      instanceId: doc.instanceId,
      guildId: doc.guildId,
      guildName: doc.guildName,
      isDiscordActivity: doc.isDiscordActivity,
      updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : doc.updatedAt,
      participantCount: (doc.participants || []).length,
      organizer: doc.participants?.[0]?.username || "Unknown",
    }));

    return NextResponse.json({ lobbies: active });
  } catch (error) {
    console.error("Lobby API GET endpoint error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const {
      instanceId,
      userId,
      username,
      guildId,
      guildName,
      isDiscordActivity,
      signals: incomingSignals,
      queue,
      roll,
      hasItem,
      activeItem,
    } = await req.json();

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
          guildId,
          guildName,
          isDiscordActivity,
          activeItem: activeItem || null,
          activeItemOwner: activeItem ? userId : null,
        };
      } else {
        // Update metadata
        mockLobbies[instanceId].updatedAt = now;
        if (guildId) mockLobbies[instanceId].guildId = guildId;
        if (guildName) mockLobbies[instanceId].guildName = guildName;
        if (isDiscordActivity !== undefined) {
          mockLobbies[instanceId].isDiscordActivity = isDiscordActivity;
        }

        // Hybrid Active Giveaway state syncing
        if (activeItem) {
          mockLobbies[instanceId].activeItem = activeItem;
          mockLobbies[instanceId].activeItemOwner = userId;
        } else if (activeItem === null) {
          // Only clear if the sender is the current active item owner
          if (mockLobbies[instanceId].activeItemOwner === userId) {
            mockLobbies[instanceId].activeItem = null;
            mockLobbies[instanceId].activeItemOwner = null;
          }
        }
      }

      const lobby = mockLobbies[instanceId];

      // Update/insert current user
      const partIndex = lobby.participants.findIndex((p) => p.userId === userId);
      if (partIndex > -1) {
        lobby.participants[partIndex].lastSeen = now;
        lobby.participants[partIndex].username = username;
        // Sync hybrid participant states
        if (queue) lobby.participants[partIndex].queue = queue;
        if (roll !== undefined) lobby.participants[partIndex].roll = roll;
        if (hasItem !== undefined) lobby.participants[partIndex].hasItem = hasItem;
      } else {
        lobby.participants.push({
          userId,
          username,
          lastSeen: now,
          queue: queue || [],
          roll: roll !== undefined ? roll : null,
          hasItem: hasItem !== undefined ? hasItem : null,
        });
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
        activeItem: lobby.activeItem || null,
        activeItemOwner: lobby.activeItemOwner || null,
        mocked: true,
      });
    }

    // --- MONGODB IMPLEMENTATION ---
    const client = await clientPromise;
    const db = client.db("givewars2");
    const collection = db.collection("lobby_sessions");

    // 1. Ensure document exists and update user heartbeat + add new signals
    const updateQuery: any = {
      $set: { updatedAt: new Date(now) },
      $push: {
        signals: {
          $each: preparedSignals,
        },
      },
    };

    if (guildId) updateQuery.$set.guildId = guildId;
    if (guildName) updateQuery.$set.guildName = guildName;
    if (isDiscordActivity !== undefined) {
      updateQuery.$set.isDiscordActivity = isDiscordActivity;
    }

    if (activeItem) {
      updateQuery.$set.activeItem = activeItem;
      updateQuery.$set.activeItemOwner = userId;
    }

    await collection.updateOne(
      { instanceId },
      updateQuery,
      { upsert: true }
    );

    // If activeItem is null, clear it in database only if the sender is the owner
    if (activeItem === null) {
      await collection.updateOne(
        { instanceId, activeItemOwner: userId },
        {
          $set: { activeItem: null, activeItemOwner: null }
        }
      );
    }

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

    const participantDoc: any = {
      userId,
      username,
      lastSeen: now,
      queue: queue || [],
    };
    if (roll !== undefined) participantDoc.roll = roll;
    if (hasItem !== undefined) participantDoc.hasItem = hasItem;

    await collection.updateOne(
      { instanceId },
      {
        $push: {
          participants: participantDoc,
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
      activeItem: doc.activeItem || null,
      activeItemOwner: doc.activeItemOwner || null,
    });
  } catch (error) {
    console.error("Lobby API POST endpoint error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
