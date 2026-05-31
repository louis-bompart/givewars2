import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { decrypt } from "@/lib/crypto";

// Server-side in-memory cache for user progression fetches to avoid hitting GW2 rate limits
interface ProgressionCacheEntry {
  skins: number[];
  dyes: number[];
  novelties: number[];
  accountName: string;
  timestamp: number;
}

const progressionCache: Record<string, ProgressionCacheEntry> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

// Novelties Cache to map Item ID -> Novelty ID
let noveltyLookupMap: Record<number, number> = {
  85244: 123, // Pre-seed Endless Choya Piñata Tonic -> Novelty 123 for mock/offline testing
};
let noveltiesFetched = false;

async function getNoveltyLookup() {
  if (noveltiesFetched) return noveltyLookupMap;
  try {
    const res = await fetch("https://api.guildwars2.com/v2/novelties?ids=all");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const tempMap: Record<number, number> = { ...noveltyLookupMap };
        for (const novelty of data) {
          if (Array.isArray(novelty.unlock_item)) {
            for (const itemId of novelty.unlock_item) {
              tempMap[itemId] = novelty.id;
            }
          }
        }
        noveltyLookupMap = tempMap;
        noveltiesFetched = true;
      }
    }
  } catch (err) {
    console.error("Failed to fetch all novelties list:", err);
  }
  return noveltyLookupMap;
}

// Mock progression databases for dev/fallback users (101 - 105)
const MOCK_ACCOUNTS: Record<string, string> = {
  "101": "Logan.1234",
  "102": "Brimstone.5678",
  "103": "Kasmeer.9876",
  "104": "Delaqua.5432",
  "105": "Taimi.2468",
};

// Deterministic mock checks for local development mode
function getMockUserProgression(userId: string): Omit<ProgressionCacheEntry, "timestamp"> {
  const skins: number[] = [];
  const dyes: number[] = [];
  const novelties: number[] = [];
  
  for (let i = 1; i <= 20000; i++) {
    if (userId === "101") {
      // Logan has 80% of skins/dyes, 50% of novelties
      if (i % 5 !== 0) skins.push(i);
      if (i % 4 !== 0) dyes.push(i);
      if (i % 2 === 0) novelties.push(i);
    } else if (userId === "102") {
      // Brimstone has weapons/skins mostly
      if (i % 2 === 0) skins.push(i);
      if (i % 5 === 0) dyes.push(i);
      if (i % 3 === 0) novelties.push(i);
    } else if (userId === "103") {
      // Kasmeer has dyes and novelties
      if (i % 6 !== 0) dyes.push(i);
      if (i % 3 === 0) skins.push(i);
      if (i % 4 === 1) novelties.push(i);
    } else if (userId === "104") {
      // Marjory has dark/shadow skins and dyes
      if (i % 4 === 1) skins.push(i);
      if (i % 3 === 1) dyes.push(i);
      if (i % 5 === 0) novelties.push(i);
    } else if (userId === "105") {
      // Taimi has novelties/toys
      if (i % 2 === 0) novelties.push(i);
      if (i % 5 === 2) skins.push(i);
      if (i % 7 === 1) dyes.push(i);
    }
  }

  return {
    skins,
    dyes,
    novelties,
    accountName: MOCK_ACCOUNTS[userId] || `User.9999`,
  };
}

// Simulated active user vaults for mock scanner testing
const MOCK_VAULTS: Record<string, Array<{ id: number; count: number }>> = {
  "101": [
    { id: 30698, count: 1 }, // Eternity Greatsword (Skin ID: 30698)
    { id: 85244, count: 2 }, // Endless Choya Tonic (Novelty ID: 123)
    { id: 20359, count: 3 }, // Abyss Dye (Color ID: 363)
    { id: 68078, count: 1 }, // Shadow Magenta Dye (Color ID: 1251)
    // Duplicate armors with identical skin unlocks to test skin ID aggregation
    { id: 11111, count: 1 }, // Krytan Coat [Berserker] (Skin ID: 999)
    { id: 11112, count: 1 }, // Krytan Coat [Rampager] (Skin ID: 999)
    
    // Items that MUST be filtered out (not wardrobe unlocks)
    { id: 19675, count: 1 }, // Gift of Mastery (crafting material)
    { id: 20323, count: 1 }, // Mini Red Panda (miniature)
  ],
  "102": [
    { id: 89115, count: 1 }, // Coalescence (accessory ring - should be filtered out!)
    { id: 70051, count: 5 }, // Black Lion Chest Key (consumable key - should be filtered out!)
    { id: 66661, count: 2 }, // Electro Blue Dye (Color ID: 1196)
  ]
};

// Default mock items details
const MOCK_ITEMS_DETAILS: Record<number, any> = {
  30698: { id: 30698, name: "Eternity", type: "Weapon", rarity: "Legendary", icon: "/gw2-render/A12C59D960E18545E0B257140B4DCB8F9A349280/455989.png", details: { default_skin: 30698 } },
  20323: { id: 20323, name: "Mini Red Panda", type: "Miniature", rarity: "Exotic", icon: "/gw2-render/EDD78E56C697B70A11F686AE290238C9B90DCE16/438341.png" },
  85244: { id: 85244, name: "Endless Choya Piñata Tonic", type: "Gizmo", rarity: "Exotic", icon: "/gw2-render/F53EEAC4145E097A4D0E18F8C67E51EE90D52249/1822021.png" },
  19675: { id: 19675, name: "Gift of Mastery", type: "CraftingMaterial", rarity: "Legendary", icon: "/gw2-render/F4A6EE2EDC813D1CEF0F1AF5F3AEBD16B278EB6B/222271.png" },
  20359: { id: 20359, name: "Abyss Dye", type: "Consumable", rarity: "Rare", icon: "/gw2-render/AB20359.png", details: { unlock_type: "Dye", color_id: 363 } },
  68078: { id: 68078, name: "Shadow Magenta Dye", type: "Consumable", rarity: "Exotic", icon: "/gw2-render/SMG68078.png", details: { unlock_type: "Dye", color_id: 1251 } },
  66661: { id: 66661, name: "Electro Blue Dye", type: "Consumable", rarity: "Exotic", icon: "/gw2-render/EB66661.png", details: { unlock_type: "Dye", color_id: 1196 } },
  89115: { id: 89115, name: "Coalescence", type: "Trinket", rarity: "Legendary", icon: "/gw2-render/9A04BFE143AEB0748F2F6D17834C68B61F5BA0A0/2099307.png" },
  70051: { id: 70051, name: "Black Lion Chest Key", type: "Consumable", rarity: "Rare", icon: "/gw2-render/47BA1FDF04DE741D8B4D49583A85B289659CAE90/619864.png" },
  11111: { id: 11111, name: "Krytan Coat [Berserker]", type: "Armor", rarity: "Rare", icon: "/gw2-render/armor11111.png", details: { default_skin: 999 } },
  11112: { id: 11112, name: "Krytan Coat [Rampager]", type: "Armor", rarity: "Rare", icon: "/gw2-render/armor11111.png", details: { default_skin: 999 } },
};

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "Missing 'userId' in payload" }, { status: 400 });
    }

    let isMockMode = false;
    let scannerApiKey = "";
    const activeGuildMembers: Array<{ userId: string; username: string; apiKey: string }> = [];

    // 1. Fetch novelties lookup mapping
    const noveltyMap = await getNoveltyLookup();

    // 2. Fetch scanning user's API Key and list of all guild mates
    if (!clientPromise) {
      if (process.env.NODE_ENV !== "development") {
        return NextResponse.json({ error: "Database not configured." }, { status: 500 });
      }
      isMockMode = true;
      console.log(`[Mock API] Wardrobe checking vault usefulness for mock user: ${userId}`);
      scannerApiKey = `MOCK-KEY-${userId}`;

      const mockUserList = [
        { id: "101", name: "Commander Logan" },
        { id: "102", name: "Tribune Brimstone" },
        { id: "103", name: "Lady Kasmeer" },
        { id: "104", name: "Jory Delaqua" },
        { id: "105", name: "Prodigy Taimi" },
      ];

      for (const m of mockUserList) {
        if (m.id !== userId) {
          activeGuildMembers.push({
            userId: m.id,
            username: m.name,
            apiKey: `MOCK-KEY-${m.id}`,
          });
        }
      }
    } else {
      const client = await clientPromise;
      const db = client.db("givewars2");

      const userDoc = await db.collection("gw2_keys").findOne({ discordUserId: userId });
      if (!userDoc || !userDoc.gw2ApiKey) {
        return NextResponse.json({ error: "You must link a Guild Wars 2 API Key before checking loot usefulness!" }, { status: 400 });
      }
      scannerApiKey = decrypt(userDoc.gw2ApiKey);

      const cursor = db.collection("gw2_keys").find({});
      const allDocs = await cursor.toArray();

      for (const doc of allDocs) {
        if (doc.discordUserId !== userId && doc.gw2ApiKey) {
          try {
            const decKey = decrypt(doc.gw2ApiKey);
            if (decKey) {
              activeGuildMembers.push({
                userId: doc.discordUserId,
                username: doc.discordUsername || "Guild Mate",
                apiKey: decKey,
              });
            }
          } catch (cryptoErr) {
            console.error(`Failed to decrypt key for user ${doc.discordUserId}:`, cryptoErr);
          }
        }
      }
    }

    if (activeGuildMembers.length === 0 && !isMockMode) {
      return NextResponse.json({
        success: true,
        items: [],
        message: "You are the only member registered in GiveWars2 right now. Share GiveWars2 with your guild mates so they can register their keys!"
      });
    }

    // 3. Fetch scanning user's vault items (bank + shared inventory slots)
    let rawVaultItems: Array<{ id: number; count: number }> = [];

    if (isMockMode) {
      rawVaultItems = MOCK_VAULTS[userId] || MOCK_VAULTS["101"];
    } else {
      try {
        const [bankRes, sharedRes] = await Promise.all([
          fetch(`https://api.guildwars2.com/v2/account/bank?access_token=${scannerApiKey}`),
          fetch(`https://api.guildwars2.com/v2/account/inventory?access_token=${scannerApiKey}`).catch(() => null),
        ]);

        if (!bankRes.ok) {
          throw new Error(`GW2 Bank API error: ${bankRes.statusText}`);
        }

        const bankItems = await bankRes.json();
        if (Array.isArray(bankItems)) {
          rawVaultItems.push(...bankItems.filter(item => item !== null).map(item => ({ id: item.id, count: item.count || 1 })));
        }

        if (sharedRes && sharedRes.ok) {
          const sharedItems = await sharedRes.json();
          if (Array.isArray(sharedItems)) {
            rawVaultItems.push(...sharedItems.filter(item => item !== null).map(item => ({ id: item.id, count: item.count || 1 })));
          }
        }
      } catch (err) {
        console.error("Failed to load scanner's vault items from GW2 API:", err);
        return NextResponse.json({ error: "Failed to connect to Guild Wars 2 API to scan your vault. Please verify your API Key scopes (requires 'inventories')." }, { status: 500 });
      }
    }

    if (rawVaultItems.length === 0) {
      return NextResponse.json({
        success: true,
        items: [],
        message: "No items found in your Bank or Shared Inventory slots. Fill them with loot in-game and try scanning again!"
      });
    }

    // 4. De-duplicate and retrieve item details in bulk
    const itemsMap: Record<number, number> = {};
    for (const raw of rawVaultItems) {
      itemsMap[raw.id] = (itemsMap[raw.id] || 0) + raw.count;
    }

    const uniqueItemIds = Object.keys(itemsMap).map(Number);
    const resolvedItemsDetails: Record<number, any> = {};

    if (isMockMode) {
      for (const id of uniqueItemIds) {
        if (MOCK_ITEMS_DETAILS[id]) {
          resolvedItemsDetails[id] = MOCK_ITEMS_DETAILS[id];
        }
      }
    } else {
      const slices: number[][] = [];
      const CHUNK_SIZE = 150;
      for (let i = 0; i < uniqueItemIds.length; i += CHUNK_SIZE) {
        slices.push(uniqueItemIds.slice(i, i + CHUNK_SIZE));
      }

      await Promise.all(slices.map(async (slice) => {
        try {
          const idsQuery = slice.join(",");
          const res = await fetch(`https://api.guildwars2.com/v2/items?ids=${idsQuery}`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
              for (const detail of data) {
                resolvedItemsDetails[detail.id] = detail;
              }
            }
          }
        } catch (sliceErr) {
          console.error("Bulk item slice fetch failed:", sliceErr);
        }
      }));
    }

    // 5. Map candidate items to their Unlocks and aggregate by UNLOCK TARGET
    // Strictly focus on: Equipment Skins, Dyes, and Gizmos & Novelties wardrobe unlocks.
    interface AggregatedCandidate {
      unlockType: "skin" | "dye" | "novelty";
      unlockId: number;
      primaryItemName: string;
      primaryIcon: string;
      rarity: string;
      type: string;
      itemIds: number[];
      count: number;
      description: string;
    }

    const aggregatedUnlocks: Record<string, AggregatedCandidate> = {};

    for (const itemId of uniqueItemIds) {
      const details = resolvedItemsDetails[itemId];
      if (!details) continue;

      const itemType = details.type;
      const count = itemsMap[itemId];

      let unlockType: AggregatedCandidate["unlockType"] | null = null;
      let unlockId: number | null = null;

      // Extract wardrobe unlock associations
      if (["Weapon", "Armor", "Back"].includes(itemType) && details.details?.default_skin) {
        // Category 1: Equipment skins
        unlockType = "skin";
        unlockId = Number(details.details.default_skin);
      } else if (itemType === "Consumable" && details.details?.unlock_type === "Dye" && details.details?.color_id) {
        // Category 2: Dyes
        unlockType = "dye";
        unlockId = Number(details.details.color_id);
      } else if (noveltyMap[itemId]) {
        // Category 3: Gizmo & Novelties
        unlockType = "novelty";
        unlockId = noveltyMap[itemId];
      }

      // Skip anything that is not one of these three wardrobe unlock categories
      if (unlockType && unlockId) {
        const groupKey = `${unlockType}:${unlockId}`;
        
        if (aggregatedUnlocks[groupKey]) {
          aggregatedUnlocks[groupKey].count += count;
          aggregatedUnlocks[groupKey].itemIds.push(itemId);
          
          const rarities = ["Junk", "Basic", "Fine", "Masterwork", "Rare", "Exotic", "Ascended", "Legendary"];
          if (rarities.indexOf(details.rarity) > rarities.indexOf(aggregatedUnlocks[groupKey].rarity)) {
            aggregatedUnlocks[groupKey].primaryItemName = details.name;
            aggregatedUnlocks[groupKey].primaryIcon = details.icon;
            aggregatedUnlocks[groupKey].rarity = details.rarity;
            aggregatedUnlocks[groupKey].type = details.type;
            aggregatedUnlocks[groupKey].description = details.description || "";
          }
        } else {
          aggregatedUnlocks[groupKey] = {
            unlockType,
            unlockId,
            primaryItemName: details.name,
            primaryIcon: details.icon ? details.icon.replace("https://render.guildwars2.com/", "/gw2-render/") : "",
            rarity: details.rarity,
            type: details.type,
            itemIds: [itemId],
            count,
            description: details.description || `A level ${details.level || 0} ${details.type.toLowerCase()}.`
          };
        }
      }
    }

    const candidateUnlocks = Object.values(aggregatedUnlocks);

    if (candidateUnlocks.length === 0) {
      return NextResponse.json({
        success: true,
        items: [],
        message: "No collection wardrobe unlocks (skins, dyes, novelties) found in your vaults."
      });
    }

    // 6. Fetch progression unlocks for all other guild members in parallel
    const membersProgression: Record<string, Omit<ProgressionCacheEntry, "timestamp">> = {};

    await Promise.all(activeGuildMembers.map(async (member) => {
      const cached = progressionCache[member.userId];
      const now = Date.now();
      if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
        membersProgression[member.userId] = cached;
        return;
      }

      if (isMockMode || member.apiKey.startsWith("MOCK-KEY-")) {
        const prog = getMockUserProgression(member.userId);
        membersProgression[member.userId] = prog;
        
        progressionCache[member.userId] = {
          ...prog,
          timestamp: now,
        };
        return;
      }

      try {
        // Strictly fetch skins, dyes, novelties - skipping minis and recipes to optimize bandwidth
        const [skinsRes, dyesRes, noveltiesRes, accRes] = await Promise.all([
          fetch(`https://api.guildwars2.com/v2/account/skins?access_token=${member.apiKey}`).catch(() => null),
          fetch(`https://api.guildwars2.com/v2/account/dyes?access_token=${member.apiKey}`).catch(() => null),
          fetch(`https://api.guildwars2.com/v2/account/novelties?access_token=${member.apiKey}`).catch(() => null),
          fetch(`https://api.guildwars2.com/v2/account?access_token=${member.apiKey}`).catch(() => null),
        ]);

        const skins = skinsRes && skinsRes.ok ? await skinsRes.json() : [];
        const dyes = dyesRes && dyesRes.ok ? await dyesRes.json() : [];
        const novelties = noveltiesRes && noveltiesRes.ok ? await noveltiesRes.json() : [];
        const acc = accRes && accRes.ok ? await accRes.json() : null;

        const progression = {
          skins: Array.isArray(skins) ? skins.map(Number) : [],
          dyes: Array.isArray(dyes) ? dyes.map(Number) : [],
          novelties: Array.isArray(novelties) ? novelties.map(Number) : [],
          accountName: acc ? acc.name : `${member.username}.9999`,
        };

        progressionCache[member.userId] = {
          ...progression,
          timestamp: now,
        };

        membersProgression[member.userId] = progression;
      } catch (err) {
        console.error(`Failed to load progression unlocks for guild member ${member.username}:`, err);
        membersProgression[member.userId] = {
          skins: [],
          dyes: [],
          novelties: [],
          accountName: `${member.username}.9999`,
        };
      }
    }));

    // 7. Perform the in-memory cross-reference matching
    const matchingResults: any[] = [];

    for (const candidate of candidateUnlocks) {
      const whoNeeds: Array<{ userId: string; username: string; gw2Account: string }> = [];
      const whoOwns: Array<{ userId: string; username: string; gw2Account: string }> = [];

      for (const member of activeGuildMembers) {
        const prog = membersProgression[member.userId];
        if (!prog) continue;

        let hasUnlocked = false;

        if (candidate.unlockType === "skin") {
          hasUnlocked = prog.skins.includes(candidate.unlockId);
        } else if (candidate.unlockType === "dye") {
          hasUnlocked = prog.dyes.includes(candidate.unlockId);
        } else if (candidate.unlockType === "novelty") {
          hasUnlocked = prog.novelties.includes(candidate.unlockId);
        }
        
        const memberInfo = {
          userId: member.userId,
          username: member.username,
          gw2Account: prog.accountName,
        };

        if (hasUnlocked) {
          whoOwns.push(memberInfo);
        } else {
          whoNeeds.push(memberInfo);
        }
      }

      if (whoNeeds.length === 0) {
        continue;
      }

      matchingResults.push({
        itemId: candidate.itemIds[0],
        itemIds: candidate.itemIds,
        unlockType: candidate.unlockType,
        unlockId: candidate.unlockId,
        name: candidate.primaryItemName,
        icon: candidate.primaryIcon,
        rarity: candidate.rarity,
        type: candidate.type,
        count: candidate.count,
        description: candidate.description,
        demandCount: whoNeeds.length,
        totalChecked: activeGuildMembers.length,
        whoNeeds,
        whoOwns,
      });
    }

    matchingResults.sort((a, b) => b.demandCount - a.demandCount);

    return NextResponse.json({
      success: true,
      items: matchingResults,
      message: `Scanned ${candidateUnlocks.length} vault wardrobe matches against ${activeGuildMembers.length} active guild mates.`
    });

  } catch (error) {
    console.error("Guild Loot Checker batch API error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
