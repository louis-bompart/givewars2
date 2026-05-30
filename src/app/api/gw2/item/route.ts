import { NextResponse } from "next/server";

// Cache items locally in-memory to prevent hitting the GW2 API repeatedly for the same item during active roll events
const itemCache: Record<string, any> = {};

// Popular pre-seeded Guild Wars 2 items for quick selection
const POPULAR_ITEMS: Record<string, any> = {
  "30698": {
    id: 30698,
    name: "Eternity",
    type: "Weapon",
    rarity: "Legendary",
    icon: "https://render.guildwars2.com/file/A12C59D960E18545E0B257140B4DCB8F9A349280/455989.png",
    description: "The legendary greatsword formed by combining Sunrise and Twilight."
  },
  "19675": {
    id: 19675,
    name: "Gift of Mastery",
    type: "CraftingMaterial",
    rarity: "Legendary",
    icon: "https://render.guildwars2.com/file/F4A6EE2EDC813D1CEF0F1AF5F3AEBD16B278EB6B/222271.png",
    description: "Used to craft Generation 1 legendary weapons."
  },
  "92209": {
    id: 92209,
    name: "Precursor Weapon Box",
    type: "Container",
    rarity: "Ascended",
    icon: "https://render.guildwars2.com/file/B2A0F5EE505B9C5F1C6B9F5441E7A07663A0F5EE/2156821.png",
    description: "Double-click to choose a Generation 1 prequel weapon."
  },
  "89115": {
    id: 89115,
    name: "Coalescence",
    type: "Trinket",
    rarity: "Legendary",
    icon: "https://render.guildwars2.com/file/9A04BFE143AEB0748F2F6D17834C68B61F5BA0A0/2099307.png",
    description: "A legendary ring pulsing with chaotic energy."
  },
  "20323": {
    id: 20323,
    name: "Mini Red Panda",
    type: "Mini",
    rarity: "Exotic",
    icon: "https://render.guildwars2.com/file/EDD78E56C697B70A11F686AE290238C9B90DCE16/438341.png",
    description: "Double-click to summon a miniature red panda."
  },
  "70051": {
    id: 70051,
    name: "Black Lion Chest Key",
    type: "Consumable",
    rarity: "Rare",
    icon: "https://render.guildwars2.com/file/47BA1FDF04DE741D8B4D49583A85B289659CAE90/619864.png",
    description: "Double-click to open locked Black Lion Chests."
  },
  "85244": {
    id: 85244,
    name: "Endless Choya Piñata Tonic",
    type: "Gizmo",
    rarity: "Exotic",
    icon: "https://render.guildwars2.com/file/F53EEAC4145E097A4D0E18F8C67E51EE90D52249/1822021.png",
    description: "Double-click to transform for 15 minutes. You will be unable to fight while transformed."
  },
  "21000": {
    id: 21000,
    name: "Mock Item (Owned)",
    type: "Container",
    rarity: "Exotic",
    icon: "https://render.guildwars2.com/file/EDD78E56C697B70A11F686AE290238C9B90DCE16/438341.png",
    description: "A test item to demonstrate what happens when someone already owns the item."
  }
};

// Helper function to rewrite GW2 render URLs to use our same-origin proxy /gw2-render
function rewriteIconUrl(iconUrl: string): string {
  if (!iconUrl) return iconUrl;
  return iconUrl.replace("https://render.guildwars2.com/", "/gw2-render/");
}

// Rewrite popular items' icons at runtime initialization to leverage the same-origin proxy
Object.keys(POPULAR_ITEMS).forEach(key => {
  if (POPULAR_ITEMS[key].icon) {
    POPULAR_ITEMS[key].icon = rewriteIconUrl(POPULAR_ITEMS[key].icon);
  }
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing 'id' parameter" }, { status: 400 });
    }

    // Check if it's one of our quick popular mock/seeded items first
    if (POPULAR_ITEMS[id]) {
      return NextResponse.json(POPULAR_ITEMS[id]);
    }

    // Check in-memory cache
    if (itemCache[id]) {
      return NextResponse.json(itemCache[id]);
    }

    // Otherwise, fetch from Guild Wars 2 API
    const response = await fetch(`https://api.guildwars2.com/v2/items/${id}`);
    
    if (!response.ok) {
      return NextResponse.json(
        { error: `GW2 API returned error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    const formattedItem = {
      id: data.id,
      name: data.name,
      type: data.type,
      rarity: data.rarity,
      icon: rewriteIconUrl(data.icon),
      description: data.description || `A level ${data.level || 0} ${data.type.toLowerCase()}.`
    };

    // Store in cache
    itemCache[id] = formattedItem;

    return NextResponse.json(formattedItem);
  } catch (error) {
    console.error("GW2 API proxy error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
