"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, PlusCircle, Search, Gift, Users, ChevronRight, Play, Key, CheckCircle2, RefreshCw } from "lucide-react";
import { ProposedItem, ParticipantRoll } from "@/hooks/useGiveaway";
import DiceTray from "./DiceTray";

interface LootQueueProps {
  proposalQueue: ProposedItem[];
  proposeItem: (itemId: number, proposedBy: string) => Promise<void>;
  launchNextProposedItem: () => void;
  activeItem: any;
  rolls: any[];
  rollingUsers: Record<string, boolean>;
  activeUser: any;
  winner: ParticipantRoll | null;
  hideSidebar?: boolean;
}

// Helper to base64-decode a Guild Wars 2 Chat Code (e.g. [&AgDqdwaA]) to extract the 3-byte little-endian Item ID
function parseGW2ChatLink(chatLink: string): number | null {
  const match = chatLink.match(/\[&([a-zA-Z0-9+/=]+)\]/);
  if (!match) return null;

  try {
    const base64 = match[1];
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Byte 0: Link Type (0x02 is Item Link)
    if (bytes[0] !== 2) return null;

    // Item ID is 3-byte little-endian starting at index 2 (Bytes 2, 3, 4)
    const itemId = bytes[2] | (bytes[3] << 8) | (bytes[4] << 16);
    return itemId > 0 ? itemId : null;
  } catch (e) {
    console.error("Failed to parse GW2 chat link:", e);
    return null;
  }
}

// Helper to extract numeric GW2 Item ID from raw input, chat codes, or database URLs
export function extractGW2ItemId(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Plain numeric check
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  // 2. Chat code check [&...]
  if (trimmed.includes("[&") && trimmed.includes("]")) {
    return parseGW2ChatLink(trimmed);
  }

  // 3. URL/Regex check - look for 4-6 digit numeric IDs in a path
  // E.g., /items/30698 or /item/30698 or simply any standalone 4-6 digit sequence in a URL
  const numericMatch = 
    trimmed.match(/(?:item|items)\/(\d{4,6})/i) || 
    trimmed.match(/id=(\d{4,6})/i) || 
    trimmed.match(/\/(\d{4,6})(?:\/|\?|$)/);
    
  if (numericMatch) {
    return Number(numericMatch[1]);
  }

  return null;
}

export default function LootQueue({
  proposalQueue,
  proposeItem,
  launchNextProposedItem,
  activeItem,
  rolls,
  rollingUsers,
  activeUser,
  winner,
  hideSidebar = false
}: LootQueueProps) {
  const [customId, setCustomId] = useState("");
  const [proposing, setProposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionState, setSuggestionState] = useState<"loading" | "unlinked" | "no-matches" | "loaded">("loading");

  useEffect(() => {
    if (!activeUser?.id) {
      setSuggestionState("unlinked");
      return;
    }

    let isMounted = true;

    const fetchSuggestions = async () => {
      setLoadingSuggestions(true);
      setSuggestionState("loading");
      try {
        const res = await fetch("/api/gw2/check-loot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: activeUser.id }),
        });

        if (!isMounted) return;

        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.items) && data.items.length > 0) {
            setSuggestions(data.items);
            setSuggestionState("loaded");
          } else {
            setSuggestions([]);
            setSuggestionState("no-matches");
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 400 || errData.error?.toLowerCase().includes("link")) {
            setSuggestionState("unlinked");
          } else {
            setSuggestionState("no-matches");
          }
        }
      } catch (err) {
        console.error("Failed to load dynamic suggestions:", err);
        if (isMounted) {
          setSuggestionState("no-matches");
        }
      } finally {
        if (isMounted) {
          setLoadingSuggestions(false);
        }
      }
    };

    fetchSuggestions();

    return () => {
      isMounted = false;
    };
  }, [activeUser]);

  const handleRefreshSuggestions = async () => {
    if (!activeUser?.id) return;
    setLoadingSuggestions(true);
    setSuggestionState("loading");
    try {
      const res = await fetch("/api/gw2/check-loot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: activeUser.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && Array.isArray(data.items) && data.items.length > 0) {
        setSuggestions(data.items);
        setSuggestionState("loaded");
      } else {
        if (res.status === 400 || data.error?.toLowerCase().includes("link")) {
          setSuggestionState("unlinked");
        } else {
          setSuggestions([]);
          setSuggestionState("no-matches");
        }
      }
    } catch (err) {
      console.error("Failed to refresh suggestions:", err);
      setSuggestionState("no-matches");
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const triggerPropose = async (itemId: number) => {
    if (!activeUser) return;
    setProposing(true);
    setError(null);
    setSuccess(null);
    try {
      await proposeItem(itemId, activeUser.username);
      setSuccess("Successfully added item to the queue lineup!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError("Failed to fetch item. Please make sure the ID/Link is correct.");
    } finally {
      setProposing(false);
    }
  };

  const handleCustomPropose = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputVal = customId.trim();
    if (!inputVal) return;

    const itemId = extractGW2ItemId(inputVal);
    if (!itemId) {
      setError("Could not parse a valid GW2 Item ID, Chat Link, or URL. Examples: 30698, [&AgDqdwaA].");
      return;
    }

    await triggerPropose(itemId);
    setCustomId("");
  };

  return (
    <div className={hideSidebar ? "hud-scrollable" : "grid-2"} style={{ display: "flex", flexDirection: "column", height: hideSidebar ? "100%" : "auto" }}>
      
      {/* COLUMN 1: Suggestion Box & Lineup */}
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        
        {/* Suggestion Form */}
        <div className="gw-card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <h2 style={{ display: "flex", alignItems: "center", gap: "10px", margin: 0, fontSize: "20px" }}>
              <Gift style={{ color: "var(--color-gold)", width: "24px", height: "24px" }} />
              Propose Guild Giveaway
            </h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginTop: "4px" }}>
              Suggest loot for upcoming guild rolls. Your suggestion will be queued chronologically!
            </p>
          </div>

          {error && (
            <div style={{ color: "#ff8a8a", padding: "12px", border: "1px solid rgba(255, 138, 138, 0.2)", borderRadius: "var(--border-radius-md)", background: "rgba(255, 138, 138, 0.05)", fontSize: "13px" }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {success && (
            <div style={{ color: "#86efac", padding: "12px", border: "1px solid rgba(74, 222, 128, 0.2)", borderRadius: "var(--border-radius-md)", background: "rgba(74, 222, 128, 0.05)", fontSize: "13px" }}>
              <strong>Success:</strong> {success}
            </div>
          )}

          {/* Grounded Suggestions */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--color-text-secondary)", margin: 0, letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "6px" }}>
                <Sparkles style={{ width: "13px", height: "13px", color: "var(--color-gold)" }} />
                Grounded Suggestions
              </h3>
              {suggestionState === "loaded" && (
                <button
                  onClick={handleRefreshSuggestions}
                  disabled={loadingSuggestions}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--color-text-secondary)",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                    transition: "color 0.2s"
                  }}
                  title="Scan Inventories Again"
                  onMouseEnter={(e) => e.currentTarget.style.color = "#fff"}
                  onMouseLeave={(e) => e.currentTarget.style.color = "var(--color-text-secondary)"}
                >
                  <RefreshCw style={{ width: "12px", height: "12px", animation: loadingSuggestions ? "spin 1.5s linear infinite" : "none" }} />
                </button>
              )}
            </div>

            {/* UNLINKED STATE */}
            {suggestionState === "unlinked" && (
              <div style={{
                background: "linear-gradient(135deg, rgba(var(--color-gold-raw), 0.08) 0%, rgba(0,0,0,0.4) 100%)",
                border: "var(--border-gold)",
                borderRadius: "12px",
                padding: "20px 16px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
                boxShadow: "var(--shadow-gold)"
              }}>
                <Key style={{ width: "24px", height: "24px", color: "var(--color-text-gold)", filter: "drop-shadow(0 0 5px rgba(var(--color-gold-raw), 0.45))" }} />
                <div style={{ fontSize: "13px", fontWeight: "700", color: "#fff" }}>
                  Vault Suggestions Locked
                </div>
                <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: 0, lineHeight: "1.4" }}>
                  Link your GW2 API key with <strong style={{ color: "#fff" }}>inventories</strong> scopes to ground suggestions on items you own that other guild mates are missing!
                </p>
                <Link
                  href="/loot-checker"
                  className="btn-epic"
                  style={{
                    fontSize: "10px",
                    padding: "6px 14px",
                    borderRadius: "20px",
                    marginTop: "4px",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <Search style={{ width: "11px", height: "11px" }} />
                  Link Key & Scan
                </Link>
              </div>
            )}

            {/* LOADING STATE */}
            {suggestionState === "loading" && (
              <div style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "var(--border-glass)",
                borderRadius: "8px",
                padding: "18px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px"
              }}>
                <RefreshCw style={{ width: "16px", height: "16px", color: "var(--color-gold)", animation: "spin 2s linear infinite" }} />
                <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                  Scanning vaults for missing guild collections...
                </span>
              </div>
            )}

            {/* NO MATCHES STATE */}
            {suggestionState === "no-matches" && (
              <div style={{
                background: "rgba(16, 185, 129, 0.04)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                borderRadius: "12px",
                padding: "20px 16px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px"
              }}>
                <div style={{ background: "rgba(16, 185, 129, 0.12)", borderRadius: "50%", padding: "8px" }}>
                  <CheckCircle2 style={{ width: "20px", height: "20px", color: "#10b981" }} />
                </div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "#fff" }}>
                  Perfect Wardrobe Coverage!
                </div>
                <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: 0, lineHeight: "1.4" }}>
                  Your bank and shared inventory slots do not contain any skins, dyes, or novelties that other registered guild members are missing. Awesome!
                </p>
              </div>
            )}

            {/* LOADED DYNAMIC SUGGESTIONS */}
            {suggestionState === "loaded" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {suggestions.slice(0, 5).map((item) => {
                  const rarityClass = `rarity-${item.rarity || "Basic"}`;
                  
                  return (
                    <button
                      key={item.itemId}
                      onClick={() => triggerPropose(item.itemId)}
                      disabled={proposing}
                      className={`tab-btn ${rarityClass}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "12px",
                        padding: "8px 12px",
                        background: "rgba(0,0,0,0.15)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: "8px",
                        width: "100%",
                        textAlign: "left",
                        cursor: "pointer",
                        boxShadow: "none"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                        e.currentTarget.style.borderColor = "var(--rarity-color, rgba(var(--color-gold-raw), 0.3))";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(0,0,0,0.15)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div className="gw2-item-icon-container" style={{ width: "24px", height: "24px", flexShrink: 0 }}>
                          <img src={item.icon || "/placeholder.png"} alt={item.name} className="gw2-item-icon" />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                          <span style={{ fontWeight: "700", color: "var(--rarity-color, #fff)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }} title={item.name}>
                            {item.name}
                          </span>
                          <span style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>
                            {item.type}
                          </span>
                        </div>
                      </div>
                      
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                        <span style={{
                          fontSize: "10px",
                          background: "rgba(74, 222, 128, 0.08)",
                          border: "1px solid rgba(74, 222, 128, 0.2)",
                          color: "#4ade80",
                          padding: "2px 8px",
                          borderRadius: "20px",
                          fontWeight: "700"
                        }}>
                          {item.demandCount} need
                        </span>
                        <PlusCircle style={{ width: "13px", height: "13px", color: "var(--color-gold)" }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Custom ID suggests */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "18px" }}>
            <h3 style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "10px", letterSpacing: "0.5px" }}>
              Suggest Custom GW2 Item, Link or Code
            </h3>
            <form onSubmit={handleCustomPropose} style={{ display: "flex", gap: "10px" }}>
              <div style={{ position: "relative", flexGrow: 1 }}>
                <Search style={{ position: "absolute", left: "14px", top: "12px", width: "16px", height: "16px", color: "var(--color-text-secondary)" }} />
                <input
                  type="text"
                  className="gw-input"
                  style={{ paddingLeft: "42px", paddingTop: "10px", paddingBottom: "10px" }}
                  placeholder="Enter ID, Chat Link [&AgDqdwaA], or Database URL..."
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  disabled={proposing}
                />
              </div>
              <button
                type="submit"
                className="btn-epic"
                style={{ padding: "10px 20px", fontSize: "13px" }}
                disabled={proposing}
              >
                {proposing ? "Adding..." : "Propose"}
              </button>
            </form>
          </div>
        </div>

        {/* Cooperative FIFO Launcher (Shows when queue is not empty) */}
        {proposalQueue.length > 0 && (
          <div 
            className="gw-card" 
            style={{ 
              background: "linear-gradient(135deg, rgba(var(--color-gold-raw), 0.12) 0%, rgba(0,0,0,0.4) 100%)",
              border: "1px solid rgba(var(--color-gold-raw), 0.4)",
              boxShadow: "var(--shadow-gold)",
              textAlign: "center",
              padding: "20px"
            }}
          >
            <h3 style={{ color: "#fff", margin: 0, fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              <Sparkles style={{ color: "var(--color-gold)" }} />
              Cooperative Roll Launcher
            </h3>
            <p style={{ color: "var(--color-text-primary)", fontSize: "13px", marginTop: "6px", marginBottom: "16px" }}>
              {activeItem ? (
                "⚠️ A giveaway roll event is currently active. Settle the active roll before launching the next suggest!"
              ) : (
                `Next Up: ${proposalQueue[0].name} (suggested by ${proposalQueue[0].proposedBy}). Ready to roll?`
              )}
            </p>
            <button
              className="btn-epic"
              onClick={launchNextProposedItem}
              disabled={!!activeItem}
              style={{ width: "100%", padding: "12px 24px", fontSize: "14px" }}
            >
              <Play style={{ width: "16px", height: "16px", fill: "currentColor" }} />
              Launch Next Giveaway (From Queue)
            </button>
          </div>
        )}

        {/* Dynamic Queue Lineup List */}
        <div className="gw-card" style={{ display: "flex", flexDirection: "column", gap: "16px", minHeight: "220px" }}>
          <div>
            <h2 style={{ display: "flex", alignItems: "center", gap: "10px", margin: 0, fontSize: "18px" }}>
              <Users style={{ color: "var(--color-gold)", width: "20px", height: "20px" }} />
              Upcoming Queue Lineup ({proposalQueue.length})
            </h2>
            <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
              First-in, First-out sequence of cooperative suggestions
            </span>
          </div>

          {proposalQueue.length === 0 ? (
            <div className="flex-center" style={{ flexGrow: 1, justifyContent: "center", padding: "30px 0", color: "var(--color-text-secondary)" }}>
              <Gift style={{ width: "40px", height: "40px", opacity: 0.15, marginBottom: "8px" }} />
              <span style={{ fontSize: "13px" }}>No suggestions in queue lineup. Be the first to suggest above!</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {proposalQueue.map((proposal, index) => {
                const rarityClass = `rarity-${proposal.rarity || "Basic"}`;
                return (
                  <div 
                    key={proposal.proposalId} 
                    className="leaderboard-row"
                    style={{ 
                      padding: "12px 14px", 
                      borderLeft: "4px solid var(--rarity-color, #a09789)",
                      background: "rgba(0,0,0,0.2)"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--color-text-gold)", width: "16px" }}>
                        #{index + 1}
                      </span>
                      <div className="gw2-item-icon-container" style={{ width: "36px", height: "36px" }}>
                        <img src={proposal.icon} alt={proposal.name} className="gw2-item-icon" />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--rarity-color, #fff)" }}>
                          {proposal.name}
                        </span>
                        <span style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontStyle: "italic" }}>
                          Suggested by <strong style={{ color: "var(--color-text-primary)" }}>{proposal.proposedBy}</strong>
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span className="user-status status-needed" style={{ fontSize: "9px" }}>
                        {index === 0 ? "Up Next" : "Queued"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
