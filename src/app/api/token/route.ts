import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { code, redirect_uri } = await req.json();

    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const clientId = process.env.DISCORD_CLIENT_ID;

    // Gracefully handle missing/TODO credentials for development and testing
    if (
      !clientSecret ||
      !clientId ||
      clientSecret.includes("TODO_REPLACE_WITH") ||
      clientId.includes("TODO_REPLACE_WITH")
    ) {
      if (process.env.NODE_ENV !== "development") {
        return NextResponse.json(
          { error: "Discord Activity credentials are misconfigured. Please check environment variables." },
          { status: 500 }
        );
      }
      console.warn("WARNING: Using mock Discord OAuth exchange because credentials are not set in environment.");
      return NextResponse.json({
        access_token: "mock-access-token-development-only",
        expires_in: 604800,
        refresh_token: "mock-refresh-token",
        scope: "identify guilds",
        token_type: "Bearer",
      });
    }

    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        ...(redirect_uri && { redirect_uri: decodeURIComponent(redirect_uri) }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Discord OAuth token exchange failed:", errorText);
      return NextResponse.json(
        { error: "Failed to exchange authorization code with Discord" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Token exchange endpoint error:", error);
    return NextResponse.json(
      { error: "Internal Server Error during token exchange" },
      { status: 500 }
    );
  }
}
