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

    const ALLOWED_GUILD_IDS = (process.env.NEXT_PUBLIC_ALLOWED_GUILD_ID || "")
      .split(",")
      .map(id => id.trim())
      .filter(Boolean);

    // 2. Fetch User Guilds
    let guild = null;
    let isMemberOfAllowedGuild = false;
    try {
      const guildsResponse = await fetch("https://discord.com/api/users/@me/guilds", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (guildsResponse.ok) {
        const guildsData = await guildsResponse.json();
        if (Array.isArray(guildsData)) {
          const matchedGuild = guildsData.find(g => ALLOWED_GUILD_IDS.includes(g.id));
          if (matchedGuild) {
            isMemberOfAllowedGuild = true;
            guild = {
              id: matchedGuild.id,
              name: matchedGuild.name,
              icon: matchedGuild.icon
                ? `https://cdn.discordapp.com/icons/${matchedGuild.id}/${matchedGuild.icon}.png`
                : undefined
            };
          }
        }
      }
    } catch (gErr) {
      console.error("Failed to fetch guilds from Discord:", gErr);
    }

    if (!isMemberOfAllowedGuild) {
      return NextResponse.json(
        {
          error: "forbidden_guild",
          message: "Access Denied: You must be a member of the authorized Discord server to use this application."
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ user, guild });
  } catch (error) {
    console.error("Error in /api/discord/me proxy route:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
