"use client";

import React from "react";
import { Dices, Lock, HelpCircle, Ban, Skull } from "lucide-react";
import { ParticipantRoll } from "@/hooks/useGiveaway";

// Standard simulated lobby players
export const LOBBY_PLAYERS = [
  { id: "mock-r1", username: "LoganThackeray.4321", globalName: "Logan" },
  { id: "mock-r2", username: "ZojjaProdigy.9988", globalName: "Zojja" },
  { id: "mock-r3", username: "EirStegalkin.7654", globalName: "Eir" },
  { id: "mock-r4", username: "Canach.2211", globalName: "Canach" },
  { id: "mock-r5", username: "BrahamEirsson.5544", globalName: "Braham" },
  { id: "mock-r6", username: "JennahQueen.1111", globalName: "Queen Jennah" }
];

interface DiceTrayProps {
  rolls: ParticipantRoll[];
  rollingUsers: Record<string, boolean>;
  activeUser: any;
  activeItem: any;
  winner: ParticipantRoll | null;
}

export default function DiceTray({ rolls, rollingUsers, activeUser, activeItem, winner }: DiceTrayProps) {
  
  if (!activeItem) {
    return (
      <div className="gw-card flex-center" style={{ minHeight: "350px", textAlign: "center", justifyContent: "center" }}>
        <Dices style={{ width: "64px", height: "64px", color: "var(--color-text-secondary)", marginBottom: "16px", opacity: 0.3 }} />
        <h2 style={{ color: "var(--color-text-secondary)" }}>Dice Tray Offline</h2>
        <p style={{ color: "var(--color-text-secondary)", maxWidth: "340px", fontSize: "14px", marginTop: "4px" }}>
          The tray will open once an officer starts a giveaway roll!
        </p>
      </div>
    );
  }

  interface SessionParticipant {
    id: string;
    username: string;
    globalName: string;
    isActivePlayer: boolean;
  }

  // Build the complete list of session participants: Active User + Lobby Players + Any other players who rolled
  const sessionParticipants: SessionParticipant[] = [];

  // 1. Add current user if online
  if (activeUser) {
    sessionParticipants.push({
      id: activeUser.id,
      username: activeUser.username,
      globalName: activeUser.globalName || activeUser.username,
      isActivePlayer: true
    });
  }

  // 2. Add standard simulated guild members (excluding current user to avoid duplicates)
  LOBBY_PLAYERS.forEach(player => {
    if (!activeUser || activeUser.id !== player.id) {
      sessionParticipants.push({
        id: player.id,
        username: player.username,
        globalName: player.globalName,
        isActivePlayer: false
      });
    }
  });

  // 3. Add any other players who have rolled (e.g. previous mock identities that rolled)
  rolls.forEach(roll => {
    const alreadyAdded = sessionParticipants.some(p => p.id === roll.userId);
    if (!alreadyAdded) {
      // Split username by dot for a nice clean visual name (e.g. "Commander.1234" becomes "Commander")
      const cleanName = roll.username.split(".")[0];
      sessionParticipants.push({
        id: roll.userId,
        username: roll.username,
        globalName: cleanName,
        isActivePlayer: false
      });
    }
  });

  return (
    <div className="dice-tray-container" style={{ minHeight: "350px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", borderBottom: "1px dashed rgba(244, 176, 36, 0.15)", paddingBottom: "12px" }}>
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "18px", margin: 0 }}>
            <span style={{ transform: "rotate(-10deg)", display: "inline-block" }}>🎲</span>
            Guild Dice Tray
          </h2>
          <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
            Watch active guild rolls land live in the tray
          </span>
        </div>
        <div style={{ background: "rgba(0,0,0,0.4)", padding: "4px 10px", borderRadius: "12px", border: "var(--border-glass)", fontSize: "11px", color: "var(--color-text-gold)", display: "flex", alignItems: "center", gap: "6px" }}>
          <span className="mock-pulse-dot" />
          <span>{sessionParticipants.length} In Lobby</span>
        </div>
      </div>

      <div className="dice-tray-grid">
        {sessionParticipants.map(participant => {
          // Find if this player has submitted a roll
          const userRoll = rolls.find(r => r.userId === participant.id);
          const isRolling = rollingUsers[participant.id];
          
          let slotState: "deciding" | "rolling" | "passed" | "ineligible" | "rolled" = "deciding";
          let rollValue = userRoll ? userRoll.roll : null;
          let ownsItem = userRoll ? userRoll.hasItem : false;

          if (isRolling) {
            slotState = "rolling";
          } else if (userRoll) {
            if (ownsItem || rollValue === 0) {
              slotState = "ineligible";
            } else if (rollValue === -1) {
              slotState = "passed";
            } else {
              slotState = "rolled";
            }
          }

          // Leader & Fumble states
          const isLeader = winner !== null && winner.userId === participant.id;
          const isFumble = slotState === "rolled" && rollValue === 1;

          let slotClass = "dice-slot";
          if (participant.isActivePlayer) slotClass += " active-player";
          if (slotState === "deciding") slotClass += " deciding";
          if (slotState === "rolling") slotClass += " rolling";
          if (slotState === "passed") slotClass += " passed";
          if (slotState === "ineligible") slotClass += " ineligible";
          if (isLeader) slotClass += " roll-leader";
          if (isFumble) slotClass += " roll-fumble";

          return (
            <div key={participant.id} className={slotClass}>
              {/* Badge for Leaders / Fumbles */}
              {isLeader && <span className="tray-badge leader">👑 Leader</span>}
              {isFumble && <span className="tray-badge fumble">Fumble!</span>}

              {/* Avatar */}
              <div 
                className="dice-slot-avatar" 
                style={{ 
                  background: participant.isActivePlayer 
                    ? "linear-gradient(135deg, var(--color-gold) 0%, var(--color-crimson) 100%)"
                    : slotState === "passed" || slotState === "ineligible"
                      ? "#30323a"
                      : "linear-gradient(135deg, #424656 0%, #202229 100%)"
                }}
              >
                {participant.globalName[0]}
              </div>

              {/* Username */}
              <span className="dice-slot-username">
                {participant.globalName}
                {participant.isActivePlayer && " (You)"}
              </span>

              {/* Beautiful 3D SVG Die */}
              <div className="tray-dice-wrapper">
                <TrayDieState slotState={slotState} rollValue={rollValue} isLeader={isLeader} isFumble={isFumble} />
              </div>

              {/* Status Subtext */}
              <span 
                className="dice-slot-status"
                style={{
                  color: isRolling
                    ? "var(--color-text-gold)"
                    : slotState === "rolled"
                      ? isLeader ? "var(--color-gold)" : isFumble ? "#ef4444" : "#4ade80"
                      : slotState === "passed"
                        ? "var(--color-text-secondary)"
                        : slotState === "ineligible"
                          ? "#ef4444"
                          : "var(--color-text-secondary)"
                }}
              >
                {isRolling ? (
                  "Rolling..."
                ) : slotState === "rolled" ? (
                  `Rolled ${rollValue}`
                ) : slotState === "passed" ? (
                  "Passed"
                ) : slotState === "ineligible" ? (
                  "Ineligible"
                ) : (
                  "Thinking..."
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sub-component to render the appropriate SVG Dice layout based on state
function TrayDieState({ slotState, rollValue, isLeader, isFumble }: { slotState: string, rollValue: number | null, isLeader: boolean, isFumble: boolean }) {
  // 1. Deciding / Thinking State (Pulse float, grey "?" center)
  if (slotState === "deciding") {
    return (
      <svg className="d20-svg-tray" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="50,5 90,30 90,70 50,95 10,70 10,30" fill="#141518" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <polygon points="50,35 70,50 50,65" fill="#1b1c20" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <polygon points="50,35 50,65 30,50" fill="#191a1e" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <text x="50" y="52" fill="rgba(255,255,255,0.25)" fontSize="24" fontFamily="var(--font-header)" fontWeight="700" textAnchor="middle" dominantBaseline="central">?</text>
      </svg>
    );
  }

  // 2. Rolling Shake State (Fast cycling color, shaking)
  if (slotState === "rolling") {
    return (
      <svg className="d20-svg-tray" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="50,5 90,30 90,70 50,95 10,70 10,30" fill="#1e180d" stroke="var(--color-gold)" strokeWidth="1.5" />
        <polygon points="50,35 70,50 50,65" fill="#302410" stroke="var(--color-gold)" strokeWidth="1.5" />
        <polygon points="50,35 50,65 30,50" fill="#2d220f" stroke="var(--color-gold)" strokeWidth="1.5" />
        <text x="50" y="52" fill="#fff" fontSize="24" fontFamily="var(--font-header)" fontWeight="800" textAnchor="middle" dominantBaseline="central">?</text>
      </svg>
    );
  }

  // 3. Ineligible Lock State (Locked padlock, greyed)
  if (slotState === "ineligible") {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg className="d20-svg-tray" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.4 }}>
          <polygon points="50,5 90,30 90,70 50,95 10,70 10,30" fill="#131315" stroke="rgba(239, 68, 68, 0.2)" strokeWidth="1" />
          <polygon points="50,35 70,50 50,65" fill="#1a1a1c" stroke="rgba(239, 68, 68, 0.2)" strokeWidth="1" />
          <polygon points="50,35 50,65 30,50" fill="#171719" stroke="rgba(239, 68, 68, 0.2)" strokeWidth="1" />
        </svg>
        <div style={{ position: "absolute", background: "rgba(0,0,0,0.6)", borderRadius: "50%", padding: "6px", border: "1px solid rgba(239,68,68,0.4)" }}>
          <Lock style={{ color: "#ef4444", width: "16px", height: "16px" }} />
        </div>
      </div>
    );
  }

  // 4. Passed State (Semi-transparent, Ban icon)
  if (slotState === "passed") {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg className="d20-svg-tray" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.35 }}>
          <polygon points="50,5 90,30 90,70 50,95 10,70 10,30" fill="#121316" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <polygon points="50,35 70,50 50,65" fill="#17191d" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <polygon points="50,35 50,65 30,50" fill="#15171a" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        </svg>
        <div style={{ position: "absolute", background: "rgba(0,0,0,0.5)", borderRadius: "50%", padding: "6px", border: "1px solid rgba(255,255,255,0.1)" }}>
          <Ban style={{ color: "var(--color-text-secondary)", width: "14px", height: "14px" }} />
        </div>
      </div>
    );
  }

  // 5. Successful Roll State (Beautifully styled numbers and facet highlights)
  const strokeColor = isLeader ? "var(--color-gold)" : isFumble ? "#ef4444" : "rgba(var(--color-gold-raw), 0.6)";
  const centerFill1 = isLeader ? "#4a3511" : isFumble ? "#441414" : "#2e323d";
  const centerFill2 = isLeader ? "#3d2a0d" : isFumble ? "#3a1111" : "#2c2f3a";
  const outerFill = isLeader ? "#2d1c08" : isFumble ? "#290c0c" : "#1b1d22";

  return (
    <svg className="d20-svg-tray" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <polygon points="50,5 90,30 90,70 50,95 10,70 10,30" fill={outerFill} stroke={strokeColor} strokeWidth="1.2" />
      
      {/* Dynamic facets */}
      <polygon points="50,5 50,35 90,30" fill={isLeader ? "#332208" : isFumble ? "#300e0e" : "#202229"} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
      <polygon points="50,5 10,30 50,35" fill={isLeader ? "#38250b" : isFumble ? "#361010" : "#242730"} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
      
      {/* Main triangular cap */}
      <polygon points="50,35 70,50 50,65" fill={centerFill1} stroke={strokeColor} strokeWidth="1.2" />
      <polygon points="50,35 50,65 30,50" fill={centerFill2} stroke={strokeColor} strokeWidth="1.2" />
      
      {/* Number text */}
      <text 
        x="50" 
        y="52" 
        className="dice-number"
        fontSize="24"
        fontFamily="var(--font-header)"
        fontWeight="800"
        fill={isLeader ? "var(--color-gold)" : isFumble ? "#f87171" : "#fff"}
        textAnchor="middle" 
        dominantBaseline="central"
      >
        {rollValue}
      </text>
    </svg>
  );
}
