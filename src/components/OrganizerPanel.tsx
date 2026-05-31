"use client";

import React, { useState } from "react";
import { ShieldAlert, Play, Trash2, Users, Search, PlusCircle, Gift, Trophy } from "lucide-react";
import { GiveawayItem, ParticipantRoll, ProposedItem } from "@/hooks/useGiveaway";

interface OrganizerPanelProps {
  activeItem: GiveawayItem | null;
  startGiveaway: (item: GiveawayItem) => void;
  endGiveaway: () => void;
  settleRound?: (winner: ParticipantRoll | null, item: GiveawayItem) => void;
  simulateMockDecision: (mockUser: { id: string; username: string }, isForcedOwned?: boolean) => void;
  autoSimulateLobby: (mockRollers: { id: string; username: string }[]) => void;
  proposalQueue?: ProposedItem[];
  rolls: ParticipantRoll[];
  winner: ParticipantRoll | null;
}

// Popular pre-seeded Guild Wars 2 items for quick selection
const SEEDED_ITEMS = [
  { id: 30698, name: "Eternity", rarity: "Legendary", type: "Weapon" },
  { id: 19675, name: "Gift of Mastery", rarity: "Legendary", type: "CraftingMaterial" },
  { id: 92209, name: "Precursor Weapon Box", rarity: "Ascended", type: "Container" },
  { id: 85244, name: "Endless Choya Piñata Tonic", rarity: "Exotic", type: "Gizmo" },
  { id: 20323, name: "Mini Red Panda", rarity: "Exotic", type: "Mini" },
  { id: 70051, name: "Black Lion Chest Key", rarity: "Rare", type: "Consumable" },
  { id: 21000, name: "Mock Item (Owned)", rarity: "Exotic", type: "Container" }
];

// Names for mock rollers simulation
const MOCK_ROLLERS = [
  { id: "mock-r1", username: "LoganThackeray.4321" },
  { id: "mock-r2", username: "ZojjaProdigy.9988" },
  { id: "mock-r3", username: "EirStegalkin.7654" },
  { id: "mock-r4", username: "Canach.2211" },
  { id: "mock-r5", username: "BrahamEirsson.5544" },
  { id: "mock-r6", username: "JennahQueen.1111" }
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

    if (bytes[0] !== 2) return null;

    const itemId = bytes[2] | (bytes[3] << 8) | (bytes[4] << 16);
    return itemId > 0 ? itemId : null;
  } catch (e) {
    console.error("Failed to parse GW2 chat link:", e);
    return null;
  }
}

// Helper to extract numeric GW2 Item ID from raw input, chat codes, or database URLs
function extractGW2ItemId(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed.includes("[&") && trimmed.includes("]")) {
    return parseGW2ChatLink(trimmed);
  }

  const numericMatch = 
    trimmed.match(/(?:item|items)\/(\d{4,6})/i) || 
    trimmed.match(/id=(\d{4,6})/i) || 
    trimmed.match(/\/(\d{4,6})(?:\/|\?|$)/);
    
  if (numericMatch) {
    return Number(numericMatch[1]);
  }

  return null;
}

export default function OrganizerPanel({
  activeItem,
  startGiveaway,
  endGiveaway,
  settleRound,
  simulateMockDecision,
  autoSimulateLobby,
  proposalQueue = [],
  rolls,
  winner
}: OrganizerPanelProps) {
  const [customId, setCustomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartSeeded = async (itemId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gw2/item?id=${itemId}`);
      if (!res.ok) throw new Error("Failed to fetch item from API");
      const item = await res.json();
      startGiveaway(item);
    } catch (err) {
      setError("Failed to load item. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputVal = customId.trim();
    if (!inputVal) return;

    const itemId = extractGW2ItemId(inputVal);
    if (!itemId) {
      setError("Could not parse a valid GW2 Item ID, Chat Link, or URL. Examples: 30698, [&AgDqdwaA].");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gw2/item?id=${itemId}`);
      if (!res.ok) {
        throw new Error("Item not found. Please verify the ID/Link is correct.");
      }
      const item = await res.json();
      startGiveaway(item);
      setCustomId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load custom item");
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateRoll = () => {
    if (!activeItem) return;
    
    // Pick a mock roller who hasn't rolled yet
    const rolledIds = rolls.map(r => r.userId);
    const availableRollers = MOCK_ROLLERS.filter(r => !rolledIds.includes(r.id));

    if (availableRollers.length === 0) {
      alert("All available mock rollers have already rolled!");
      return;
    }

    const randomMock = availableRollers[Math.floor(Math.random() * availableRollers.length)];
    simulateMockDecision(randomMock);
  };

  const handleSimulateAll = () => {
    if (!activeItem) return;
    autoSimulateLobby(MOCK_ROLLERS);
  };


  return (
    <div className="gw-card" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h2 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ShieldAlert style={{ color: "var(--color-gold)", width: "24px", height: "24px" }} />
          Organizer Dashboard (Officers Only)
        </h2>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginTop: "4px" }}>
          Select and trigger Guild giveaways. Once an item is in play, guild members can roll on their screens.
        </p>
      </div>

      {error && (
        <div style={{ color: "#ff8a8a", padding: "12px", border: "1px solid rgba(255, 138, 138, 0.2)", borderRadius: "var(--border-radius-md)", background: "rgba(255, 138, 138, 0.05)", fontSize: "14px" }}>
          <strong>Error: </strong> {error}
        </div>
      )}

      {!activeItem ? (
        // STATE 1: Select Item to Start Giveaway
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Quick Select Grid */}
          <div>
            <h3 style={{ fontSize: "15px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "12px", letterSpacing: "0.5px" }}>
              Quick Selection Popular Items
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
              {SEEDED_ITEMS.map((item) => (
                <button
                  key={item.id}
                  className="btn-epic"
                  onClick={() => handleStartSeeded(item.id)}
                  disabled={loading}
                  style={{
                    fontSize: "13px",
                    padding: "12px",
                    letterSpacing: "0.5px",
                    justifyContent: "flex-start",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255,255,255,0.06)"
                  }}
                >
                  <PlusCircle style={{ width: "16px", height: "16px", color: "var(--color-gold)", marginRight: "8px" }} />
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 600, color: "#fff" }}>{item.name}</div>
                    <div style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>ID: {item.id} • {item.rarity}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom ID Search */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "20px" }}>
            <h3 style={{ fontSize: "15px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "12px", letterSpacing: "0.5px" }}>
              Launch Custom GW2 Item, Link or Code
            </h3>
            <form onSubmit={handleStartCustom} style={{ display: "flex", gap: "10px" }}>
              <div style={{ position: "relative", flexGrow: 1 }}>
                <Search style={{ position: "absolute", left: "14px", top: "14px", width: "16px", height: "16px", color: "var(--color-text-secondary)" }} />
                <input
                  type="text"
                  className="gw-input"
                  style={{ paddingLeft: "42px" }}
                  placeholder="Enter ID, Chat Link [&AgDqdwaA], or Database URL..."
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                className="btn-epic"
                style={{ padding: "12px 24px", fontSize: "14px" }}
                disabled={loading}
              >
                {loading ? "Searching..." : "Start"}
              </button>
            </form>
          </div>
        </div>
      ) : (
        // STATE 2: Active Giveaway Control Panel
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "var(--border-radius-md)", padding: "16px", border: "var(--border-gold)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "12px", color: "var(--color-text-gold)", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" }}>
                🔴 Active Giveaway Event
              </span>
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                {rolls.length} rolls submitted
              </span>
            </div>
            
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <img src={activeItem.icon} alt={activeItem.name} style={{ width: "36px", height: "36px", borderRadius: "4px", border: "1px solid var(--color-gold)" }} />
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "16px" }}>{activeItem.name}</div>
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>ID: {activeItem.id} • {activeItem.rarity} {activeItem.type}</div>
              </div>
            </div>
          </div>

          {/* Winner Showcase inside Organizer */}
          {winner && (
            <div style={{ background: "rgba(26, 147, 6, 0.1)", border: "1px solid rgba(26, 147, 6, 0.3)", borderRadius: "var(--border-radius-md)", padding: "12px 16px", fontSize: "14px", color: "#bbf7d0" }}>
              🎉 Current Winner is <strong>{winner.username}</strong> with a roll of <strong>{winner.roll}</strong>!
            </div>
          )}

          {/* Mock Roller Simulations */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "16px" }}>
            <h3 style={{ fontSize: "14px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "12px", letterSpacing: "0.5px" }}>
              Dev Tools / Simulator (Test offline browser rolls)
            </h3>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                className="btn-epic"
                onClick={handleSimulateRoll}
                style={{
                  fontSize: "13px",
                  padding: "10px 16px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.1)"
                }}
              >
                <Users style={{ width: "16px", height: "16px", marginRight: "8px" }} />
                Simulate 1 Roll
              </button>
              
              <button
                className="btn-epic"
                onClick={handleSimulateAll}
                style={{
                  fontSize: "13px",
                  padding: "10px 16px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.1)"
                }}
              >
                <Users style={{ width: "16px", height: "16px", marginRight: "8px" }} />
                Simulate All Rollers ({MOCK_ROLLERS.length})
              </button>
            </div>
            <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", display: "block", marginTop: "8px" }}>
              💡 Simulations will generate random d20 values and report random owned/unlocked settings.
            </span>
          </div>

          {/* Action Row */}
          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
            {settleRound && (
              <button
                className="btn-epic btn-gold"
                onClick={() => settleRound(winner, activeItem)}
                style={{
                  flexGrow: 1,
                  padding: "14px",
                  border: "1px solid var(--color-gold)",
                  background: "rgba(244, 176, 36, 0.12)",
                  color: "var(--color-text-gold)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px"
                }}
                title="Settle round immediately with current rolls"
              >
                <Trophy style={{ width: "16px", height: "16px" }} />
                Force Settle
              </button>
            )}
            <button
              className="btn-epic btn-crimson"
              onClick={endGiveaway}
              style={{ flexGrow: 1, padding: "14px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
            >
              <Trash2 style={{ width: "16px", height: "16px" }} />
              Abort Giveaway
            </button>
          </div>

        </div>
      )}

      {/* Member Queue Lineup Preview */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "20px", marginTop: "20px" }}>
        <h3 style={{ fontSize: "14px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "12px", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "6px" }}>
          <Gift style={{ width: "16px", height: "16px", color: "var(--color-gold)" }} />
          Active Cooperative Queue Preview ({proposalQueue.length})
        </h3>
        
        {proposalQueue.length === 0 ? (
          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
            The cooperative suggestion queue is currently empty.
          </span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "150px", overflowY: "auto", background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "var(--border-radius-md)", border: "1px solid rgba(255,255,255,0.04)" }}>
            {proposalQueue.map((proposal, idx) => (
              <div key={proposal.proposalId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "var(--color-text-gold)", fontWeight: 700 }}>#{idx + 1}</span>
                  <img src={proposal.icon} alt={proposal.name} style={{ width: "18px", height: "18px", borderRadius: "2px" }} />
                  <span style={{ color: "#fff", fontWeight: 600 }}>{proposal.name}</span>
                </div>
                <span style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>by {proposal.proposedBy}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
