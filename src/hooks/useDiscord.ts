"use client";

import { useEffect, useState } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";

export interface DiscordUser {
  id: string;
  username: string;
  globalName?: string;
  avatarUrl?: string;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon?: string;
}

export interface DiscordContextType {
  isInDiscord: boolean;
  user: DiscordUser | null;
  guild: DiscordGuild | null;
  loading: boolean;
  error: string | null;
  discordSdk: DiscordSDK | null;
}

const CLIENT_ID = (() => {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  if (!clientId) {
    throw new Error("NEXT_PUBLIC_DISCORD_CLIENT_ID is not defined");
  }
  return clientId;
})();


// Fallback Mock Users for Standalone Browser Mode
const MOCK_USERS: DiscordUser[] = [
  { id: "101", username: "Commander.1234", globalName: "Commander Logan", avatarUrl: "" },
  { id: "102", username: "Rytlock.5678", globalName: "Tribune Brimstone", avatarUrl: "" },
  { id: "103", username: "Kasmeer.9876", globalName: "Lady Kasmeer", avatarUrl: "" },
  { id: "104", username: "Marjory.5432", globalName: "Jory Delaqua", avatarUrl: "" },
  { id: "105", username: "Taimi.2468", globalName: "Prodigy Taimi", avatarUrl: "" },
];

export function useDiscord() {
  const [context, setContext] = useState<DiscordContextType>({
    isInDiscord: false,
    user: null,
    guild: null,
    loading: true,
    error: null,
    discordSdk: null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    let isMounted = true;
    let sdkInstance: DiscordSDK | null = null;

    async function initializeApp() {
      // 1. Create a timeout to detect standalone browser vs Discord
      const sdkPromise = (async () => {
        try {
          sdkInstance = new DiscordSDK(CLIENT_ID);
          await sdkInstance.ready();
          return sdkInstance;
        } catch (e) {
          throw new Error("Discord handshake failed or not in Discord environment.");
        }
      })();

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout waiting for Discord SDK")), 1500)
      );

      try {
        // Race the SDK ready event against the 1.5s timeout
        const sdk = await Promise.race([sdkPromise, timeoutPromise]);

        if (!sdk) {
          throw new Error("SDK instance is null");
        }

        // 2. We are in Discord! Perform authentication
        const { code } = await sdk.commands.authorize({
          client_id: CLIENT_ID,
          response_type: "code",
          state: "",
          prompt: "none",
          scope: ["identify", "guilds"],
        });

        // Exchange code for token securely via our API route
        const tokenResponse = await fetch("/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        if (!tokenResponse.ok) {
          throw new Error("Failed to exchange Discord authorization code");
        }

        const { access_token } = await tokenResponse.json();

        // Authenticate with the retrieved token
        const auth = await sdk.commands.authenticate({ access_token });

        if (!isMounted) return;

        // Fetch user information using authenticated SDK or via API
        let discordUser: DiscordUser = {
          id: auth.user.id,
          username: auth.user.username,
          globalName: auth.user.global_name || undefined,
          avatarUrl: auth.user.avatar
            ? `https://cdn.discordapp.com/avatars/${auth.user.id}/${auth.user.avatar}.png`
            : undefined,
        };

        // Get guild info if running in a guild context
        let discordGuild: DiscordGuild | null = null;
        if (sdk.guildId) {
          discordGuild = {
            id: sdk.guildId,
            name: "My Discord Guild", // Discord SDK does not always provide Guild Name directly client-side without extra API calls, but we store the ID.
          };
        }

        setContext({
          isInDiscord: true,
          user: discordUser,
          guild: discordGuild,
          loading: false,
          error: null,
          discordSdk: sdk,
        });

      } catch (err) {
        // Fallback to STANDALONE BROWSER (MOCK MODE)
        if (!isMounted) return;

        console.log("Entering Standalone Mock Mode:", err instanceof Error ? err.message : String(err));

        // Pick a random mock user or let the user override
        const localMockUser = localStorage.getItem("gw2_mock_user");
        let activeMockUser = localMockUser ? JSON.parse(localMockUser) : null;

        if (!activeMockUser) {
          activeMockUser = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];
          localStorage.setItem("gw2_mock_user", JSON.stringify(activeMockUser));
        }

        setContext({
          isInDiscord: false,
          user: activeMockUser,
          guild: { id: "mock-guild-1", name: "Eternal Baguette [BAGU]" },
          loading: false,
          error: null,
          discordSdk: null,
        });
      }
    }

    initializeApp();

    return () => {
      isMounted = false;
    };
  }, []);

  const changeMockUser = (user: DiscordUser) => {
    localStorage.setItem("gw2_mock_user", JSON.stringify(user));
    setContext(prev => ({
      ...prev,
      user,
    }));
  };

  return {
    ...context,
    changeMockUser,
    mockUsers: MOCK_USERS,
  };
}
