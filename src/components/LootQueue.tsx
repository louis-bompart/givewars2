"use client";

import React, { useState } from "react";
import { Sparkles, PlusCircle, Search, Gift, Users, ChevronRight, Play } from "lucide-react";
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

// Popular pre-seeded items for quick suggests
const QUICK_SUGGEST_ITEMS = [
  { id: 30698, name: "Eternity", rarity: "Legendary", type: "Weapon" },
  { id: 19675, name: "Gift of Mastery", rarity: "Legendary", type: "Crafting" },
  { id: 85244, name: "Endless Choya Piñata Tonic", rarity: "Exotic", type: "Gizmo" },
  { id: 20323, name: "Mini Red Panda", rarity: "Exotic", type: "Mini" },
  { id: 70051, name: "Black Lion Chest Key", rarity: "Rare", type: "Key" },
  { id: 89115, name: "Coalescence", rarity: "Legendary", type: "Ring" }
];

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

          {/* Quick suggestions lineup tags */}
          <div>
            <h3 style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "10px", letterSpacing: "0.5px" }}>
              Quick Suggestions Curated Loot
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {QUICK_SUGGEST_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => triggerPropose(item.id)}
                  disabled={proposing}
                  className="tab-btn"
                  style={{
                    fontSize: "12px",
                    padding: "6px 12px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: "20px"
                  }}
                >
                  <PlusCircle style={{ width: "12px", height: "12px", color: "var(--color-gold)", marginRight: "4px" }} />
                  {item.name} ({item.rarity})
                </button>
              ))}
            </div>
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
