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
      // 1. Detect if code query parameter exists in standard browser URL
      const urlParams = new URLSearchParams(window.location.search);
      const redirect_uri = encodeURIComponent(window.location.origin)
      const urlCode = urlParams.get("code");

      if (urlCode) {
        try {
          const tokenResponse = await fetch("/api/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: urlCode, redirect_uri }),
          });

          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json();
            if (tokenData.access_token) {
              localStorage.setItem("givewars2_discord_token", tokenData.access_token);
            }
          }
        } catch (tokenExchangeErr) {
          console.error("Failed to exchange browser url code for token:", tokenExchangeErr);
        } finally {
          // Clean the code parameter from the URL to keep it clean and secure
          const cleanUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      }

      // 2. If a browser OAuth token exists, verify and load profile info
      const browserToken = localStorage.getItem("givewars2_discord_token");
      if (browserToken) {
        try {
          const response = await fetch("/api/discord/me", {
            headers: {
              Authorization: `Bearer ${browserToken}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            if (isMounted) {
              setContext({
                isInDiscord: false,
                user: data.user,
                guild: data.guild,
                loading: false,
                error: null,
                discordSdk: null,
              });
              return;
            }
          } else {
            // Token is invalid or expired
            localStorage.removeItem("givewars2_discord_token");
          }
        } catch (meError) {
          console.error("Failed to fetch Discord profile with saved browser token:", meError);
          localStorage.removeItem("givewars2_discord_token");
        }
      }

      // 3. Fallback to Discord Embedded SDK initialization (only succeeds inside Discord client)
      const sdkPromise = (async () => {
        try {
          sdkInstance = new DiscordSDK(CLIENT_ID);
          await sdkInstance.ready();
          return sdkInstance;
        } catch {
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

        // We are in Discord! Perform authentication
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
        const discordUser: DiscordUser = {
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
            name: "My Discord Guild",
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
        // Fallback to STANDALONE BROWSER (MOCK MODE in dev, login screen in prod)
        if (!isMounted) return;

        console.log("Entering Standalone Mode (Unauthenticated or Mock Fallback):", err instanceof Error ? err.message : String(err));

        let activeMockUser = null;
        if (process.env.NODE_ENV === "development") {
          const localMockUser = localStorage.getItem("gw2_mock_user");
          activeMockUser = localMockUser ? JSON.parse(localMockUser) : null;

          if (!activeMockUser) {
            activeMockUser = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];
            localStorage.setItem("gw2_mock_user", JSON.stringify(activeMockUser));
          }
        }

        setContext({
          isInDiscord: false,
          user: activeMockUser,
          guild: activeMockUser ? { id: "mock-guild-1", name: "Eternal Baguette [BAGU]" } : null,
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

  const logout = () => {
    localStorage.removeItem("givewars2_discord_token");
    localStorage.removeItem("gw2_mock_user");
    setContext({
      isInDiscord: false,
      user: null,
      guild: null,
      loading: false,
      error: null,
      discordSdk: null,
    });
  };

  return {
    ...context,
    changeMockUser,
    logout,
    mockUsers: MOCK_USERS,
  };
}
