import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
    }

    const token = authHeader.substring(7);

    // 1. Fetch User Profile
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!userResponse.ok) {
      const errText = await userResponse.text();
      console.error("Failed to fetch Discord user profile:", errText);
      return NextResponse.json(
        { error: "Failed to fetch user profile from Discord" },
        { status: userResponse.status }
      );
    }

    const userData = await userResponse.json();

    const avatarUrl = userData.avatar
      ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
      : undefined;

    const user = {
      id: userData.id,
      username: userData.username,
      globalName: userData.global_name || undefined,
      avatarUrl,
    };

    // 2. Fetch User Guilds
    let guild = null;
    try {
      const guildsResponse = await fetch("https://discord.com/api/users/@me/guilds", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (guildsResponse.ok) {
        const guildsData = await guildsResponse.json();
        if (Array.isArray(guildsData) && guildsData.length > 0) {
          // Look for a guild containing "baguette" or use the first available guild
          const baguetteGuild = guildsData.find(g => 
            g.name.toLowerCase().includes("baguette") || 
            g.name.toLowerCase().includes("eternal")
          );
          
          const selected = baguetteGuild || guildsData[0];
          guild = {
            id: selected.id,
            name: selected.name,
            icon: selected.icon 
              ? `https://cdn.discordapp.com/icons/${selected.id}/${selected.icon}.png`
              : undefined
          };
        }
      }
    } catch (gErr) {
      console.error("Failed to fetch guilds from Discord:", gErr);
    }

    // Default fallback if no guild is mapped
    if (!guild) {
      guild = {
        id: "browser-guild",
        name: "Eternal Baguette [BAGU]",
      };
    }

    return NextResponse.json({ user, guild });
  } catch (error) {
    console.error("Error in /api/discord/me proxy route:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
