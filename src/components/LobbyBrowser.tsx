"use client";

import React, { useState, useEffect } from "react";
import { DiscordUser, DiscordGuild } from "@/hooks/useDiscord";
import { Compass, Users, RefreshCw, Link, Play, Sparkles } from "lucide-react";

interface ActiveLobby {
  instanceId: string;
  guildId?: string;
  guildName?: string;
  isDiscordActivity?: boolean;
  updatedAt: number;
  participantCount: number;
  organizer: string;
}

interface LobbyBrowserProps {
  user: DiscordUser | null;
  guild: DiscordGuild | null;
  onJoinLobby: (lobbyId: string) => void;
}

export default function LobbyBrowser({ user, guild, onJoinLobby }: LobbyBrowserProps) {
  const [lobbies, setLobbies] = useState<ActiveLobby[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualCode, setManualCode] = useState("");
  const [manualError, setManualError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchActiveLobbies = async (showRefreshIndicator = false) => {
    if (!guild) return;
    if (showRefreshIndicator) setIsRefreshing(true);
    try {
      const response = await fetch(`/api/lobby?guildId=${guild.id}`);
      if (response.ok) {
        const data = await response.json();
        setLobbies(data.lobbies || []);
      }
    } catch (err) {
      console.error("Failed to fetch active guild lobbies:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Poll for active lobbies every 5 seconds
  useEffect(() => {
    if (!guild) return;
    fetchActiveLobbies();
    const interval = setInterval(() => fetchActiveLobbies(), 5000);
    return () => clearInterval(interval);
  }, [guild]);

  const handleManualJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError("");
    
    let targetId = manualCode.trim();
    if (!targetId) {
      setManualError("Please enter a lobby code or invite link.");
      return;
    }

    // Support entering a full join URL
    try {
      if (targetId.startsWith("http://") || targetId.startsWith("https://")) {
        const url = new URL(targetId);
        const urlParam = url.searchParams.get("lobbyId") || url.searchParams.get("join");
        if (urlParam) {
          targetId = urlParam;
        } else {
          setManualError("Could not find a valid lobby ID in that link.");
          return;
        }
      }
    } catch {
      // Not a URL, treat as raw ID
    }

    onJoinLobby(targetId);
  };

  const handleSandboxJoin = () => {
    // Generate a unique testing sandbox ID
    const sandboxId = `sandbox-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    onJoinLobby(sandboxId);
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return "Just now";
    return `${seconds}s ago`;
  };

  return (
    <div style={{ maxWidth: "800px", margin: "20px auto", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Hero Welcome banner */}
      <div className="gw-card" style={{
        padding: "32px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        background: "radial-gradient(circle at 80% 20%, rgba(var(--color-gold-raw), 0.1) 0%, rgba(20, 22, 26, 0.9) 100%)",
        borderColor: "rgba(var(--color-gold-raw), 0.15)",
        boxShadow: "var(--shadow-gold)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Sparkles style={{ color: "var(--color-text-gold)", width: "20px", height: "20px" }} />
          <span style={{ fontSize: "11px", color: "var(--color-text-gold)", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase" }}>
            Lobby Discovery Portal
          </span>
        </div>
        <h2 style={{ fontSize: "30px", margin: 0, color: "#fff", fontFamily: "var(--font-header)", letterSpacing: "1px" }}>
          Welcome, {user?.globalName || user?.username}!
        </h2>
        <p style={{ margin: 0, fontSize: "14px", color: "var(--color-text-primary)", lineHeight: "1.6" }}>
          To join a cooperative Guild Giveaway session, connect to a live lobby started by a Discord Activity player, paste an invitation link, or create a private sandbox lobby for offline testing.
        </p>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "1.2fr 0.8fr" }}>
        {/* LEFT COLUMN: Active Lobbies */}
        <div className="gw-card" style={{ display: "flex", flexDirection: "column", gap: "20px", minHeight: "360px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", textTransform: "uppercase", letterSpacing: "1px" }}>
              <Compass style={{ color: "var(--color-gold)", width: "18px", height: "18px" }} />
              Active Server Sessions
            </h3>
            {guild && (
              <button
                onClick={() => fetchActiveLobbies(true)}
                disabled={isRefreshing}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "12px"
                }}
                className="refresh-btn"
              >
                <RefreshCw style={{ width: "12px", height: "12px", transform: isRefreshing ? "rotate(360deg)" : "none", transition: "transform 0.5s ease" }} />
                Refresh
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexGrow: 1, gap: "12px", color: "var(--color-text-secondary)" }}>
              <div className="dice-rolling" style={{ fontSize: "28px" }}>🎲</div>
              <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "1.5px" }}>Seeking active lobbies...</div>
            </div>
          ) : lobbies.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexGrow: 1, padding: "20px 10px", textAlign: "center", gap: "16px" }}>
              <div style={{ fontSize: "40px", filter: "opacity(0.4)" }}>⚔️</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <h4 style={{ margin: 0, fontSize: "15px", color: "var(--color-text-gold)", textTransform: "uppercase" }}>No Active Guild Activities</h4>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-secondary)", maxWidth: "340px", lineHeight: "1.5" }}>
                  We couldn't detect any active giveaway sessions in the <strong>{guild?.name || "Cooperative Guild"}</strong> server. Ask an officer or guildmate to launch the activity inside a Discord channel!
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {lobbies.map((lobby) => (
                <div key={lobby.instanceId} className="gw2-item" style={{
                  padding: "16px",
                  borderLeft: "4px solid var(--color-gold)",
                  background: "rgba(0, 0, 0, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "between",
                  gap: "16px"
                }}>
                  <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, gap: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{
                        background: "rgba(16, 185, 129, 0.15)",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                        color: "#10b981",
                        fontSize: "9px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        letterSpacing: "0.5px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}>
                        <span className="pulse-indicator" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#10b981" }} />
                        LIVE
                      </span>
                      {lobby.isDiscordActivity && (
                        <span style={{ background: "rgba(88, 101, 242, 0.15)", border: "1px solid rgba(88, 101, 242, 0.3)", color: "#5865F2", fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", letterSpacing: "0.5px" }}>
                          DISCORD
                        </span>
                      )}
                    </div>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: "14px", fontFamily: "var(--font-header)" }}>
                      Lobby by {lobby.organizer}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px", color: "var(--color-text-secondary)" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <Users style={{ width: "11px", height: "11px" }} />
                        {lobby.participantCount} {lobby.participantCount === 1 ? "player" : "players"}
                      </span>
                      <span>•</span>
                      <span>Active {formatTimeAgo(lobby.updatedAt)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => onJoinLobby(lobby.instanceId)}
                    className="btn-epic"
                    style={{
                      padding: "8px 16px",
                      fontSize: "12px",
                      borderRadius: "6px",
                      letterSpacing: "1px",
                      boxShadow: "none"
                    }}
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Join Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Option A: Manual Code */}
          <div className="gw-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", textTransform: "uppercase", letterSpacing: "1px" }}>
              <Link style={{ color: "var(--color-gold)", width: "16px", height: "16px" }} />
              Connect with Invite
            </h3>
            <form onSubmit={handleManualJoin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label className="input-label" htmlFor="lobby-code">Lobby Link or ID</label>
                <input
                  id="lobby-code"
                  type="text"
                  placeholder="Paste URL or Session ID..."
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  className="gw-input"
                  style={{ padding: "10px 14px", fontSize: "13px" }}
                />
                {manualError && (
                  <div style={{ color: "#fca5a5", fontSize: "11px", marginTop: "6px" }}>
                    {manualError}
                  </div>
                )}
              </div>
              <button
                type="submit"
                className="btn-epic"
                style={{ width: "100%", padding: "10px 20px", fontSize: "13px", letterSpacing: "1px", boxShadow: "none" }}
              >
                Connect to Lobby
              </button>
            </form>
          </div>

          {/* Option B: Developer Sandbox */}
          <div className="gw-card" style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            borderColor: "rgba(255, 255, 255, 0.05)"
          }}>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", textTransform: "uppercase", letterSpacing: "1px" }}>
              <Play style={{ color: "var(--color-text-secondary)", width: "16px", height: "16px" }} />
              Developer Sandbox
            </h3>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
              Want to explore the cooperative giveaway interface or test dice rolling in standalone mode without active Discord members? Spin up a sandbox room with automated mock rollers.
            </p>
            <button
              onClick={handleSandboxJoin}
              className="btn-epic btn-crimson"
              style={{ padding: "10px 20px", fontSize: "13px", letterSpacing: "1px", boxShadow: "none" }}
            >
              Launch Sandbox
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
