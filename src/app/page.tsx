"use client";

import React, { useState } from "react";
import { useDiscord } from "@/hooks/useDiscord";
import { useGiveaway } from "@/hooks/useGiveaway";
import DiceRoller from "@/components/DiceRoller";
import GW2Profile from "@/components/GW2Profile";
import OrganizerPanel from "@/components/OrganizerPanel";
import DiceTray from "@/components/DiceTray";
import LootQueue from "@/components/LootQueue";
import { Dices, Shield, ShieldAlert, Sparkles, RefreshCw, Gift } from "lucide-react";

export default function Home() {
  const { isInDiscord, user, guild, loading, error, changeMockUser, mockUsers } = useDiscord();
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
    winner
  } = useGiveaway();
  const [activeTab, setActiveTab] = useState<"roll" | "queue" | "profile" | "organizer">("roll");

  // Custom API Key storage (persists locally in user's browser)
  const [apiKey, setApiKey] = React.useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("gw2_api_key") || "";
    }
    return "";
  });

  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    if (typeof window !== "undefined") {
      localStorage.setItem("gw2_api_key", key);
    }
  };

  const handleRollSubmitted = (rollValue: number, hasItem: boolean) => {
    if (!user) return;
    submitRoll(user.id, user.username, rollValue, hasItem);
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
          <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(255, 255, 255, 0.03)", border: "var(--border-glass)", padding: "6px 14px", borderRadius: "20px" }}>
            <div className="avatar-mock" style={{ width: "20px", height: "20px" }} />
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>{user.username}</span>
          </div>
        )}
      </header>

      {/* Standalone Browser (Mock Mode) Developer Bar */}
      {!isInDiscord && (
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
          Loot Queue ({proposalQueue.length})
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
            proposalQueue={proposalQueue}
            proposeItem={proposeItem}
            launchNextProposedItem={launchNextProposedItem}
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
              />
            </div>

            {activeTab === "profile" && (
              <GW2Profile apiKey={apiKey} setApiKey={handleSaveApiKey} />
            )}

            {activeTab === "organizer" && (
              <OrganizerPanel
                activeItem={activeItem}
                startGiveaway={startGiveaway}
                endGiveaway={endGiveaway}
                simulateMockDecision={simulateMockDecision}
                autoSimulateLobby={autoSimulateLobby}
                proposalQueue={proposalQueue}
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

      {/* Footer */}
      <footer className="footer">
        <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginBottom: "8px" }}>
          <span>GiveWars2 v0.1.0-alpha</span>
          <span>•</span>
          <span>Designed for Eternal Baguette [BAGU]</span>
          <span>•</span>
          <a href="https://api.guildwars2.com" target="_blank" rel="noreferrer" style={{ color: "var(--color-gold)" }}>GW2 API Enabled</a>
        </div>
        <div>
          This application is not affiliated with ArenaNet, Guild Wars 2, or NCSOFT. All GW2 assets belong to their respective creators.
        </div>
      </footer>
    </div>
  );
}
