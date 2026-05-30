"use client";

import React, { useState } from "react";
import { useDiscord } from "@/hooks/useDiscord";
import { useGiveaway } from "@/hooks/useGiveaway";
import { useWebRTC } from "@/hooks/useWebRTC";
import { ProposedItem } from "@/hooks/useGiveaway";
import DiceRoller from "@/components/DiceRoller";
import GW2Profile from "@/components/GW2Profile";
import OrganizerPanel from "@/components/OrganizerPanel";
import DiceTray from "@/components/DiceTray";
import LootQueue from "@/components/LootQueue";
import ApiKeyModal from "@/components/ApiKeyModal";
import LobbyBrowser from "@/components/LobbyBrowser";
import { Dices, Shield, ShieldAlert, Sparkles, RefreshCw, Gift, Share2, LogOut } from "lucide-react";

export default function Home() {
  const { isInDiscord, user, guild, loading, error, changeMockUser, mockUsers, logout, discordSdk } = useDiscord();

  const handleDiscordLogin = () => {
    if (typeof window === "undefined") return;
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    if (!clientId) {
      alert("Discord Client ID is missing. Please check your environment variables.");
      return;
    }
    const redirectUri = encodeURIComponent(window.location.origin);
    const scope = encodeURIComponent("identify guilds");
    const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    window.location.href = discordAuthUrl;
  };
  const {
    activeItem,
    rolls,
    rollingUsers,
    proposalQueue,
    proposeItem,
    launchNextProposedItem,
    startGiveaway,
    submitRoll,
    endGiveaway,
    simulateMockDecision,
    autoSimulateLobby,
    setActiveItem,
    setRolls,
    removeProposedItem,
    winner
  } = useGiveaway();

  const [peerQueues, setPeerQueues] = useState<Record<string, ProposedItem[]>>({});

  const [selectedLobbyId, setSelectedLobbyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync lobbyId from URL query parameter or sessionStorage on mount
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const urlLobbyId = urlParams.get("lobbyId") || urlParams.get("join");

    if (urlLobbyId) {
      setSelectedLobbyId(urlLobbyId);
      sessionStorage.setItem("givewars2_active_lobby_id", urlLobbyId);
      // Clean query parameters from URL without reloading
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
      return;
    }

    const storedLobbyId = sessionStorage.getItem("givewars2_active_lobby_id");
    if (storedLobbyId) {
      setSelectedLobbyId(storedLobbyId);
    }
  }, []);

  const handleJoinLobby = (lobbyId: string) => {
    setSelectedLobbyId(lobbyId);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("givewars2_active_lobby_id", lobbyId);
    }
  };

  const handleLeaveLobby = () => {
    setSelectedLobbyId(null);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("givewars2_active_lobby_id");
    }
  };

  const handleShareInvite = () => {
    if (typeof window === "undefined" || !instanceId) return;
    const shareUrl = `${window.location.origin}/?lobbyId=${instanceId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const instanceId = React.useMemo(() => {
    if (!user) return null;
    if (isInDiscord && discordSdk?.instanceId) {
      return discordSdk.instanceId;
    }
    return selectedLobbyId;
  }, [user, isInDiscord, discordSdk, selectedLobbyId]);

  const {
    connectedPeers,
    broadcastRoll,
    broadcastActiveItem,
    broadcastEndGiveaway,
    broadcastConsumeProposal,
  } = useWebRTC({
    instanceId,
    userId: user?.id || null,
    username: user?.username || null,
    guildId: guild?.id || null,
    guildName: guild?.name || null,
    isDiscordActivity: isInDiscord,
    localQueue: proposalQueue,
    activeItem,
    rolls,
    onQueueUpdate: (peerUserId, queue) => {
      setPeerQueues((prev) => {
        const next = { ...prev };
        if (queue.length === 0) {
          delete next[peerUserId];
        } else {
          next[peerUserId] = queue;
        }
        return next;
      });
    },
    onRoll: (peerUserId, username, roll, hasItem) => {
      submitRoll(peerUserId, username, roll, hasItem);
    },
    onActiveItem: (item) => {
      setActiveItem(item);
      setRolls([]);
    },
    onEndGiveaway: () => {
      endGiveaway();
    },
    onConsumeProposal: (proposalId) => {
      removeProposedItem(proposalId);
    },
  });

  // Merge local and peer queues chronologically (FIFO)
  const displayedQueue = React.useMemo(() => {
    return [
      ...proposalQueue,
      ...Object.values(peerQueues).flat()
    ].sort((a, b) => a.timestamp - b.timestamp);
  }, [proposalQueue, peerQueues]);

  const handleLaunchNext = () => {
    if (displayedQueue.length === 0) return;
    const nextItem = displayedQueue[0];

    // Start active roll event
    startGiveaway({
      id: nextItem.id,
      name: nextItem.name,
      type: nextItem.type,
      rarity: nextItem.rarity,
      icon: nextItem.icon,
      description: nextItem.description
    });

    // Broadcast active item to peers
    broadcastActiveItem(nextItem);

    // Consume item
    const isLocal = proposalQueue.some(p => p.proposalId === nextItem.proposalId);
    if (isLocal) {
      removeProposedItem(nextItem.proposalId);
    } else {
      broadcastConsumeProposal(nextItem.proposalId);
    }
  };

  const handleStartGiveaway = (item: any) => {
    startGiveaway(item);
    broadcastActiveItem(item);
  };

  const handleEndGiveaway = () => {
    endGiveaway();
    broadcastEndGiveaway();
  };

  const [activeTab, setActiveTab] = useState<"roll" | "queue" | "profile" | "organizer">("roll");

  // Custom API Key storage (persists locally in user's browser as a fast-load fallback)
  const [apiKey, setApiKey] = React.useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("gw2_api_key") || "";
    }
    return "";
  });

  const [showKeyModal, setShowKeyModal] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

  // Load API Key from database when Discord user identity is resolved
  React.useEffect(() => {
    if (!user) return;

    const userId = user.id;

    async function loadDbApiKey() {
      try {
        const response = await fetch(`/api/gw2/apikey?userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.apiKey !== undefined) {
            setApiKey(data.apiKey);
            if (typeof window !== "undefined") {
              if (data.apiKey) {
                localStorage.setItem("gw2_api_key", data.apiKey);
              } else {
                localStorage.removeItem("gw2_api_key");
              }
            }

            // Auto-open modal once if they don't have an API key configured yet
            if (!data.apiKey && !hasAutoOpened) {
              setShowKeyModal(true);
              setHasAutoOpened(true);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load API key from database:", err);
      }
    }

    loadDbApiKey();
  }, [user, hasAutoOpened]);

  const handleSaveApiKey = async (key: string): Promise<boolean | string> => {
    const trimmedKey = key.trim();
    setApiKey(trimmedKey);

    if (typeof window !== "undefined") {
      if (trimmedKey) {
        localStorage.setItem("gw2_api_key", trimmedKey);
      } else {
        localStorage.removeItem("gw2_api_key");
      }
    }

    if (user) {
      try {
        const response = await fetch("/api/gw2/apikey", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            username: user.username,
            apiKey: trimmedKey,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          const errMsg = errorData.error || "Failed to sync API key with database.";
          console.error("Failed to sync API key with database:", errMsg);
          return errMsg;
        } else {
          console.log("Successfully synced API key with database!");
          return true;
        }
      } catch (err) {
        console.error("Error syncing API key with database:", err);
        return "Failed to connect to database. Please check your network connection.";
      }
    }
    return true;
  };

  const handleFlushData = async (): Promise<boolean | string> => {
    setApiKey("");
    if (typeof window !== "undefined") {
      localStorage.removeItem("gw2_api_key");
    }

    if (user) {
      try {
        const response = await fetch(`/api/gw2/apikey?userId=${user.id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const errorData = await response.json();
          const errMsg = errorData.error || "Failed to flush data from database.";
          console.error("Failed to flush data from database:", errMsg);
          return errMsg;
        } else {
          console.log("Successfully flushed all user data from database!");
          return true;
        }
      } catch (err) {
        console.error("Error flushing data from database:", err);
        return "Failed to connect to database. Please check your network connection.";
      }
    }
    return true;
  };


  const handleRollSubmitted = (rollValue: number, hasItem: boolean) => {
    if (!user) return;
    submitRoll(user.id, user.username, rollValue, hasItem);
    broadcastRoll(user.username, rollValue, hasItem);
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: "100vh", backgroundColor: "var(--color-bg-dark)", color: "var(--color-text-gold)", gap: "16px" }}>
        <div className="dice-rolling" style={{ fontSize: "40px" }}>🎲</div>
        <div style={{ fontFamily: "var(--font-header)", letterSpacing: "2px", fontSize: "18px" }}>LOADING GIVEWARS2...</div>
        <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Initializing Discord Handshake</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-center" style={{ minHeight: "100vh", backgroundColor: "var(--color-bg-dark)", color: "#fff", padding: "20px", textAlign: "center", flexDirection: "column", background: "radial-gradient(circle at center, #1e0909 0%, #0d0404 100%)" }}>
        <style dangerouslySetInnerHTML={{
          __html: `
          @keyframes pulse-crimson {
            0%, 100% {
              transform: scale(1);
              filter: drop-shadow(0 0 5px rgba(168, 43, 43, 0.4));
            }
            50% {
              transform: scale(1.05);
              filter: drop-shadow(0 0 15px rgba(168, 43, 43, 0.8));
            }
          }
        `}} />
        <div className="gw-card" style={{
          padding: "40px",
          maxWidth: "500px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5), var(--shadow-crimson)",
          borderColor: "rgba(168, 43, 43, 0.3)"
        }}>
          {/* Header strip with glow */}
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "3px",
            background: "linear-gradient(90deg, transparent, var(--color-crimson), transparent)"
          }} />

          {/* Shield Alert Icon with animation */}
          <div style={{
            background: "linear-gradient(135deg, rgba(168, 43, 43, 0.2) 0%, rgba(168, 43, 43, 0.05) 100%)",
            border: "1px solid rgba(168, 43, 43, 0.4)",
            borderRadius: "50%",
            width: "80px",
            height: "80px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "24px",
            boxShadow: "var(--shadow-crimson)",
            position: "relative"
          }}>
            <ShieldAlert style={{ width: "40px", height: "40px", color: "#ffa4a4", animation: "pulse-crimson 2s infinite ease-in-out" }} />
          </div>

          <h1 style={{ fontFamily: "var(--font-header)", letterSpacing: "3px", fontSize: "28px", margin: "0 0 8px 0", color: "#fff", textShadow: "0 0 10px rgba(168, 43, 43, 0.5)" }}>
            ACCESS DENIED
          </h1>
          <div style={{ fontSize: "11px", background: "rgba(168, 43, 43, 0.15)", color: "#ff9e9e", border: "1px solid rgba(168, 43, 43, 0.3)", padding: "2px 8px", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "20px", fontWeight: "600" }}>
            Guild Restricted
          </div>

          <p style={{ color: "var(--color-text-primary)", fontSize: "14px", lineHeight: "1.6", marginBottom: "20px", margin: "0 0 20px 0" }}>
            {error}
          </p>

          <p style={{ color: "var(--color-text-secondary)", fontSize: "12px", lineHeight: "1.5", margin: "0 0 30px 0" }}>
            This application is exclusively authorized for members of designated partner servers.
            Please make sure you are logged in with the correct Discord account that has access to an authorized server.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
            <button
              onClick={logout}
              className="btn-epic btn-crimson"
              style={{
                width: "100%",
                padding: "12px 28px",
                fontSize: "14px",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                justifyContent: "center",
                cursor: "pointer"
              }}
            >
              <RefreshCw style={{ width: "16px", height: "16px" }} />
              Log Out & Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user && !isInDiscord) {
    return (
      <div className="flex-center" style={{ minHeight: "100vh", backgroundColor: "var(--color-bg-dark)", color: "#fff", padding: "20px", textAlign: "center", flexDirection: "column", background: "radial-gradient(circle at center, #1e1015 0%, #0d0608 100%)" }}>
        <div style={{
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          padding: "40px",
          maxWidth: "480px",
          backdropFilter: "blur(12px)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.4)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center"
        }}>
          <div style={{
            background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-crimson) 100%)",
            borderRadius: "50%",
            width: "80px",
            height: "80px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "24px",
            boxShadow: "0 0 30px rgba(244, 176, 36, 0.3)"
          }}>
            <span style={{ fontSize: "40px", animation: "wobble 2s ease-in-out infinite" }}>🎲</span>
          </div>

          <h1 style={{ fontFamily: "var(--font-header)", letterSpacing: "3px", fontSize: "28px", margin: "0 0 8px 0", color: "#fff" }}>
            GIVEWARS2
          </h1>
          <div style={{ fontSize: "11px", background: "rgba(244, 176, 36, 0.15)", color: "var(--color-text-gold)", border: "1px solid var(--color-gold-glow)", padding: "2px 8px", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "20px" }}>
            Guild Giveaway Activity
          </div>

          <p style={{ color: "var(--color-text-primary)", fontSize: "14px", lineHeight: "1.6", marginBottom: "30px", margin: "0 0 30px 0" }}>
            Welcome to the cooperative loot giveaway system! Connect your Discord account to join active roll lobbies, verify item ownership with your GW2 API key, and suggest loot.
          </p>

          <button
            onClick={handleDiscordLogin}
            style={{
              padding: "12px 28px",
              fontSize: "15px",
              fontWeight: "600",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              width: "100%",
              justifyContent: "center",
              background: "linear-gradient(90deg, #5865F2 0%, #4752C4 100%)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 15px rgba(88, 101, 242, 0.3)",
              transition: "transform 0.2s, box-shadow 0.2s"
            }}
          >
            <svg width="20" height="20" viewBox="0 0 127.14 96.36" fill="currentColor">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.9-.65,1.76-1.34,2.58-2a75.59,75.59,0,0,0,72.78,0c.82.71,1.68,1.4,2.58,2a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.87,50.12,123.63,27.3,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
            </svg>
            Connect Discord Account
          </button>

          <div style={{ marginTop: "24px", fontSize: "11px", color: "var(--color-text-secondary)" }}>
            Cooperative Guild Activity
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      {/* Top Banner / Navigation Head */}
      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", padding: "20px 0", marginBottom: "20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-crimson) 100%)", borderRadius: "8px", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-gold)" }}>
            <span style={{ fontSize: "24px", transform: "rotate(-10deg)" }}>🎲</span>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "24px", fontFamily: "var(--font-header)", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
              GiveWars2
              <span style={{ fontSize: "11px", background: "rgba(244, 176, 36, 0.15)", color: "var(--color-text-gold)", border: "1px solid var(--color-gold-glow)", padding: "2px 6px", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "1px", verticalAlign: "middle" }}>
                Alpha
              </span>
            </h1>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-secondary)" }}>
              {guild ? `Active in ${guild.name}` : "Discord x GuildWars2 Give Away App"}
            </p>
          </div>
        </div>

        {/* User profile state snippet */}
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {instanceId && (
              <button
                onClick={handleShareInvite}
                style={{
                  background: copied ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 176, 36, 0.12)",
                  color: copied ? "#10b981" : "var(--color-text-gold)",
                  border: copied ? "1px solid rgba(16, 185, 129, 0.3)" : "var(--border-gold)",
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.2s"
                }}
              >
                <Share2 style={{ width: "12px", height: "12px" }} />
                {copied ? "Link Copied!" : "Share Invite"}
              </button>
            )}

            {!isInDiscord && selectedLobbyId && (
              <button
                onClick={handleLeaveLobby}
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "#ef4444",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.2s"
                }}
              >
                <LogOut style={{ width: "12px", height: "12px" }} />
                Leave Lobby
              </button>
            )}

            {connectedPeers.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "6px 14px", borderRadius: "20px", fontSize: "12px", color: "#10b981", fontWeight: "600" }}>
                <span className="pulse-indicator" style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#10b981", display: "inline-block" }}></span>
                {connectedPeers.length} {connectedPeers.length === 1 ? "Peer" : "Peers"} Connected
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(255, 255, 255, 0.03)", border: "var(--border-glass)", padding: "6px 14px", borderRadius: "20px" }}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" style={{ width: "20px", height: "20px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)" }} />
              ) : (
                <div className="avatar-mock" style={{ width: "20px", height: "20px" }} />
              )}
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>
                {user.globalName || user.username}
              </span>
            </div>

            {!isInDiscord && (
              <button
                onClick={logout}
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "#ef4444",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
              >
                Log Out
              </button>
            )}
          </div>
        )}
      </header>

      {!instanceId ? (
        <LobbyBrowser user={user} guild={guild} onJoinLobby={handleJoinLobby} />
      ) : (
        <>
          {/* Standalone Browser (Mock Mode) Developer Bar */}
          {!isInDiscord && process.env.NODE_ENV === "development" && (
            <div className="mock-banner">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="mock-badge">Mock Mode</span>
                <span style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>
                  Running outside Discord iframe. Simulated players are enabled for testing!
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Identity:</span>
                <select
                  style={{
                    background: "rgba(0,0,0,0.6)",
                    color: "#fff",
                    border: "var(--border-gold)",
                    borderRadius: "4px",
                    padding: "4px 8px",
                    fontSize: "12px",
                    fontFamily: "var(--font-body)"
                  }}
                  value={user ? JSON.stringify(user) : ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      changeMockUser(JSON.parse(e.target.value));
                    }
                  }}
                >
                  {mockUsers.map((mu) => (
                    <option key={mu.id} value={JSON.stringify(mu)}>
                      {mu.username} ({mu.globalName})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Main Tab Controller navigation */}
          <nav className="tabs-nav">
            <button
              className={`tab-btn ${activeTab === "roll" ? "active" : ""}`}
              onClick={() => setActiveTab("roll")}
            >
              <Dices style={{ width: "16px", height: "16px" }} />
              Dice Roll
            </button>
            <button
              className={`tab-btn ${activeTab === "queue" ? "active" : ""}`}
              onClick={() => setActiveTab("queue")}
            >
              <Gift style={{ width: "16px", height: "16px" }} />
              Loot Queue ({displayedQueue.length})
            </button>
            <button
              className={`tab-btn ${activeTab === "profile" ? "active" : ""}`}
              onClick={() => setActiveTab("profile")}
            >
              <Shield style={{ width: "16px", height: "16px" }} />
              GW2 Account
            </button>
            <button
              className={`tab-btn ${activeTab === "organizer" ? "active" : ""}`}
              onClick={() => setActiveTab("organizer")}
            >
              <ShieldAlert style={{ width: "16px", height: "16px" }} />
              Organizer
            </button>
          </nav>

          {/* Main Responsive Layout Body */}
          <main style={{ flexGrow: 1 }}>

            {/* Loot Queue Tab */}
            {activeTab === "queue" && (
              <LootQueue
                proposalQueue={displayedQueue}
                proposeItem={proposeItem}
                launchNextProposedItem={handleLaunchNext}
                activeItem={activeItem}
                rolls={rolls}
                rollingUsers={rollingUsers}
                activeUser={user}
                winner={winner}
              />
            )}

            {/* Other Tabs */}
            {activeTab !== "queue" && (
              <div className="grid-2" style={{ gridTemplateColumns: activeTab === "roll" ? "1fr 1fr" : "1fr" }}>

                {/* COLUMN 1: Active Tab Render */}
                <div style={{ display: activeTab === "roll" ? "block" : "none" }}>
                  <DiceRoller
                    activeItem={activeItem}
                    user={user}
                    apiKey={apiKey}
                    onRollSubmitted={handleRollSubmitted}
                    rolls={rolls}
                    onOpenKeyModal={() => setShowKeyModal(true)}
                  />
                </div>

                {activeTab === "profile" && (
                  <GW2Profile apiKey={apiKey} setApiKey={handleSaveApiKey} onFlushData={handleFlushData} />
                )}

                {activeTab === "organizer" && (
                  <OrganizerPanel
                    activeItem={activeItem}
                    startGiveaway={handleStartGiveaway}
                    endGiveaway={handleEndGiveaway}
                    simulateMockDecision={simulateMockDecision}
                    autoSimulateLobby={autoSimulateLobby}
                    proposalQueue={displayedQueue}
                    rolls={rolls}
                    winner={winner}
                  />
                )}

                {/* COLUMN 2: Sidebar (Shows Dice Tray on Roll tab) */}
                {activeTab === "roll" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <DiceTray
                      rolls={rolls}
                      rollingUsers={rollingUsers}
                      activeUser={user}
                      activeItem={activeItem}
                      winner={winner}
                    />
                  </div>
                )}

              </div>
            )}
          </main>
        </>
      )}

      {/* Footer */}
      <footer className="footer">
        <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginBottom: "8px" }}>
          <span>GiveWars2 v0.1.0-alpha</span>
          <span>•</span>
          <span>{guild ? `Active in ${guild.name}` : "Cooperative Guild Activity"}</span>
          <span>•</span>
          <a href="https://api.guildwars2.com" target="_blank" rel="noreferrer" style={{ color: "var(--color-gold)" }}>GW2 API Enabled</a>
        </div>
        <div>
          This application is not affiliated with ArenaNet, Guild Wars 2, or NCSOFT. All GW2 assets belong to their respective creators.
        </div>
      </footer>

      {/* API Key Instructions & Connect Modal */}
      <ApiKeyModal
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        onSave={handleSaveApiKey}
        initialKey={apiKey}
      />
    </div>
  );
}
