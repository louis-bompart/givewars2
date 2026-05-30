"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, Dices, HelpCircle, CheckCircle, AlertTriangle } from "lucide-react";
import { ParticipantRoll } from "@/hooks/useGiveaway";

interface DiceRollerProps {
  activeItem: any;
  user: any;
  apiKey: string;
  onRollSubmitted: (rollValue: number, hasItem: boolean) => void;
  rolls: ParticipantRoll[];
  onOpenKeyModal: () => void;
}

export default function DiceRoller({ activeItem, user, apiKey, onRollSubmitted, rolls, onOpenKeyModal }: DiceRollerProps) {
  const [isRolling, setIsRolling] = useState(false);
  const [currentRoll, setCurrentRoll] = useState<number | null>(null);
  const [hasItem, setHasItem] = useState<boolean>(false);
  const [checkingOwnership, setCheckingOwnership] = useState<boolean>(false);
  const [hasAlreadyRolled, setHasAlreadyRolled] = useState<boolean>(false);

  // Check if current user has already rolled
  useEffect(() => {
    if (!user || !rolls) return;
    const rolled = rolls.some(r => r.userId === user.id);
    setHasAlreadyRolled(rolled);
    
    // Find what their current roll was if they did
    if (rolled) {
      const userRoll = rolls.find(r => r.userId === user.id);
      if (userRoll) setCurrentRoll(userRoll.roll);
    } else {
      setCurrentRoll(null);
    }
  }, [user, rolls, activeItem]);

  // Check Guild Wars 2 inventory ownership of the active item
  useEffect(() => {
    if (!activeItem || !apiKey) {
      setHasItem(false);
      return;
    }

    async function checkGW2Ownership() {
      setCheckingOwnership(true);
      try {
        const idStr = activeItem.id.toString();
        let isOwned = false;

        // Smart mock check for a special test item
        if (idStr === "21000") {
          isOwned = true;
        } else {
          // 1. Check Bank & Shared Inventory (requires inventories scope)
          const [bankRes, invRes] = await Promise.all([
            fetch(`https://api.guildwars2.com/v2/account/bank?access_token=${apiKey}`).catch(() => null),
            fetch(`https://api.guildwars2.com/v2/account/inventory?access_token=${apiKey}`).catch(() => null),
          ]);

          if (bankRes && bankRes.ok) {
            const bankItems = await bankRes.json();
            if (Array.isArray(bankItems)) {
              if (bankItems.some(item => item && item.id === activeItem.id)) {
                isOwned = true;
              }
            }
          }

          if (!isOwned && invRes && invRes.ok) {
            const invItems = await invRes.json();
            if (Array.isArray(invItems)) {
              if (invItems.some(item => item && item.id === activeItem.id)) {
                isOwned = true;
              }
            }
          }

          // 2. Specialty unlock checks if not already found in bank/inventory
          if (!isOwned) {
            let endpoint = "";
            if (activeItem.type === "Mini") {
              endpoint = "minis";
            } else if (activeItem.type === "Dye") {
              endpoint = "dyes";
            } else if (["Weapon", "Armor", "Back"].includes(activeItem.type)) {
              endpoint = "skins";
            }

            if (endpoint) {
              const res = await fetch(`https://api.guildwars2.com/v2/account/${endpoint}?access_token=${apiKey}`);
              if (res.ok) {
                const unlocks = await res.json();
                if (Array.isArray(unlocks)) {
                  isOwned = unlocks.includes(activeItem.id);
                }
              }
            }
            
            // 3. Novelty check for Gizmos / Consumables (like Endless Tonics)
            if (!isOwned && ["Gizmo", "Consumable"].includes(activeItem.type)) {
              const noveltiesRes = await fetch("https://api.guildwars2.com/v2/novelties?ids=all").catch(() => null);
              if (noveltiesRes && noveltiesRes.ok) {
                const allNovelties = await noveltiesRes.json();
                if (Array.isArray(allNovelties)) {
                  const matchingNovelty = allNovelties.find((n: any) => n.unlock_item && n.unlock_item.includes(activeItem.id));
                  if (matchingNovelty) {
                    const accNoveltiesRes = await fetch(`https://api.guildwars2.com/v2/account/novelties?access_token=${apiKey}`).catch(() => null);
                    if (accNoveltiesRes && accNoveltiesRes.ok) {
                      const accNovelties = await accNoveltiesRes.json();
                      if (Array.isArray(accNovelties) && accNovelties.includes(matchingNovelty.id)) {
                        isOwned = true;
                      }
                    }
                  }
                }
              }
            }
          }
        }

        setHasItem(isOwned);
      } catch (err) {
        console.error("Error checking item ownership:", err);
      } finally {
        setCheckingOwnership(false);
      }
    }

    checkGW2Ownership();
  }, [activeItem, apiKey]);

  const handleRoll = () => {
    if (isRolling || hasAlreadyRolled || !activeItem) return;

    setIsRolling(true);

    // Dynamic fake number changes during shake animation
    let tickCount = 0;
    const interval = setInterval(() => {
      setCurrentRoll(Math.floor(Math.random() * 20) + 1);
      tickCount++;
      if (tickCount > 8) {
        clearInterval(interval);
      }
    }, 90);

    setTimeout(() => {
      const finalRoll = Math.floor(Math.random() * 20) + 1;
      setCurrentRoll(finalRoll);
      setIsRolling(false);
      onRollSubmitted(finalRoll, hasItem);
    }, 800);
  };

  const handlePass = () => {
    if (isRolling || hasAlreadyRolled || !activeItem) return;
    onRollSubmitted(-1, false);
  };

  if (!activeItem) {
    return (
      <div className="gw-card flex-center" style={{ minHeight: "350px", textAlign: "center", justifyContent: "center", gap: "10px" }}>
        <Dices style={{ width: "64px", height: "64px", color: "var(--color-text-secondary)", marginBottom: "12px", opacity: 0.3 }} />
        <h2 style={{ color: "var(--color-text-secondary)", margin: 0 }}>No Active Giveaway</h2>
        <p style={{ color: "var(--color-text-secondary)", maxWidth: "340px", fontSize: "14px", marginTop: "4px", lineHeight: "1.5" }}>
          There is no Guild Wars 2 item currently in play.
        </p>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "var(--border-glass)", borderRadius: "var(--border-radius-md)", padding: "12px 18px", maxWidth: "340px", marginTop: "12px" }}>
          <span style={{ fontSize: "13px", color: "var(--color-text-gold)", fontWeight: 600, display: "block", marginBottom: "4px" }}>💡 Suggest the Next Item!</span>
          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
            Go to the <strong>Loot Queue</strong> tab at the top to suggest your own item or launch one of the pending suggestions!
          </span>
        </div>
      </div>
    );
  }

  // Choose border style based on item rarity
  const rarityClass = `rarity-${activeItem.rarity || "Basic"}`;

  return (
    <div className="gw-card" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h2 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Sparkles style={{ color: "var(--color-gold)", width: "24px", height: "24px" }} />
          Wednesday Guild Roll!
        </h2>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginTop: "4px" }}>
          Roll your virtual d20 to win the active item! Only players who need the item can win.
        </p>
      </div>

      {/* Active Item Showcase Card */}
      <div className={`gw2-item ${rarityClass}`}>
        <div className="gw2-item-icon-container">
          <img src={activeItem.icon} alt={activeItem.name} className="gw2-item-icon" />
        </div>
        <div className="gw2-item-details">
          <span className="gw2-item-name">{activeItem.name}</span>
          <span className="gw2-item-type">{activeItem.rarity} {activeItem.type}</span>
          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px", fontStyle: "italic" }}>
            {activeItem.description}
          </span>
        </div>
      </div>

      {/* Guild Wars 2 API Ownership Integration Warning */}
      {apiKey ? (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: checkingOwnership ? "rgba(255,255,255,0.02)" : hasItem ? "rgba(168,43,43,0.12)" : "rgba(26,147,6,0.12)", border: checkingOwnership ? "1px solid rgba(255,255,255,0.05)" : hasItem ? "1px solid rgba(168,43,43,0.3)" : "1px solid rgba(26,147,6,0.3)", borderRadius: "var(--border-radius-md)" }}>
          {checkingOwnership ? (
            <>
              <HelpCircle style={{ color: "var(--color-text-secondary)", animation: "spin 2s linear infinite" }} />
              <span style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>Checking your GW2 unlocks...</span>
            </>
          ) : hasItem ? (
            <>
              <AlertTriangle style={{ color: "#fca5a5" }} />
              <div>
                <span style={{ fontSize: "14px", color: "#fecaca", fontWeight: 600, display: "block" }}>Already Unlocked!</span>
                <span style={{ fontSize: "12px", color: "#fca5a5" }}>Your GW2 account already has this item unlocked. You can still roll for fun, but you won't be eligible to win!</span>
              </div>
            </>
          ) : (
            <>
              <CheckCircle style={{ color: "#4ade80" }} />
              <div>
                <span style={{ fontSize: "14px", color: "#bbf7d0", fontWeight: 600, display: "block" }}>Missing from Collection!</span>
                <span style={{ fontSize: "12px", color: "#86efac" }}>You do not own this item. You are fully eligible to win this giveaway! Good luck!</span>
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "12px", 
          padding: "14px 18px", 
          background: "rgba(244, 176, 36, 0.04)", 
          border: "1px solid rgba(244, 176, 36, 0.15)", 
          borderRadius: "var(--border-radius-md)",
          flexWrap: "wrap",
          justifyContent: "space-between",
          boxSizing: "border-box",
          width: "100%"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexGrow: 1, minWidth: "200px" }}>
            <HelpCircle style={{ color: "var(--color-text-gold)", width: "18px", height: "18px", minWidth: "18px" }} />
            <span style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: "1.4" }}>
              Connect your <strong>GW2 API Key</strong> to qualify for active giveaways and enable automatic inventory eligibility scanning!
            </span>
          </div>
          <button 
            className="btn-epic" 
            onClick={onOpenKeyModal}
            style={{ 
              padding: "6px 14px", 
              fontSize: "12px", 
              letterSpacing: "0.5px", 
              marginTop: "4px",
              background: "linear-gradient(135deg, rgba(var(--color-gold-raw), 0.12) 0%, rgba(var(--color-gold-raw), 0.04) 100%)",
              boxShadow: "none"
            }}
          >
            Setup Key
          </button>
        </div>
      )}

      {/* Main Dice Rolling Arena */}
      <div className="flex-center" style={{ margin: "20px 0" }}>
        <div className="dice-wrapper" onClick={!hasAlreadyRolled && activeItem && !isRolling ? handleRoll : undefined} style={{ cursor: hasAlreadyRolled || isRolling ? "default" : "pointer" }}>
          {/* Beautiful 3D SVG representation of a D20 */}
          <svg className={`d20-svg ${isRolling ? "dice-rolling" : ""}`} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <polygon points="50,5 90,30 90,70 50,95 10,70 10,30" fill="#1b1d22" stroke="var(--color-gold)" strokeWidth="1.5" />
            {/* Triangular facets of d20 */}
            <polygon points="50,5 50,35 90,30" fill="#202229" stroke="rgba(var(--color-gold-raw), 0.3)" strokeWidth="1" />
            <polygon points="50,5 10,30 50,35" fill="#242730" stroke="rgba(var(--color-gold-raw), 0.3)" strokeWidth="1" />
            <polygon points="10,30 10,70 30,50" fill="#17191d" stroke="rgba(var(--color-gold-raw), 0.3)" strokeWidth="1" />
            <polygon points="90,30 70,50 90,70" fill="#17191d" stroke="rgba(var(--color-gold-raw), 0.3)" strokeWidth="1" />
            <polygon points="50,95 90,70 50,65" fill="#202229" stroke="rgba(var(--color-gold-raw), 0.3)" strokeWidth="1" />
            <polygon points="50,95 50,65 10,70" fill="#242730" stroke="rgba(var(--color-gold-raw), 0.3)" strokeWidth="1" />
            
            {/* Center triangular cap where number resides */}
            <polygon points="50,35 70,50 50,65" fill="#2e323d" stroke="var(--color-gold)" strokeWidth="1.5" />
            <polygon points="50,35 50,65 30,50" fill="#2c2f3a" stroke="var(--color-gold)" strokeWidth="1.5" />
            <polygon points="30,50 10,30 50,35" fill="#1e2026" stroke="rgba(var(--color-gold-raw), 0.3)" strokeWidth="1" />
            <polygon points="70,50 50,35 90,30" fill="#1e2026" stroke="rgba(var(--color-gold-raw), 0.3)" strokeWidth="1" />
            <polygon points="30,50 50,65 10,70" fill="#1b1c20" stroke="rgba(var(--color-gold-raw), 0.3)" strokeWidth="1" />
            <polygon points="70,50 90,70 50,65" fill="#1b1c20" stroke="rgba(var(--color-gold-raw), 0.3)" strokeWidth="1" />
            
            {/* Text Node */}
            <text x="50" y="52" className="dice-number">
              {currentRoll !== null ? (currentRoll === -1 ? "—" : currentRoll === 0 ? "🔒" : currentRoll) : "?"}
            </text>
          </svg>
        </div>

        {/* Upgraded Epic Decision Buttons */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", width: "100%", maxWidth: "320px" }}>
          {isRolling ? (
            <button className="btn-epic" disabled style={{ width: "100%" }}>
              Rolling...
            </button>
          ) : hasAlreadyRolled ? (
            <div style={{ textAlign: "center", width: "100%" }}>
              {currentRoll === -1 ? (
                <div style={{ background: "rgba(255,255,255,0.03)", border: "var(--border-glass)", borderRadius: "var(--border-radius-md)", padding: "12px 18px", color: "var(--color-text-secondary)", fontSize: "14px" }}>
                  🚫 <strong>You Passed</strong>
                  <span style={{ display: "block", fontSize: "12px", marginTop: "4px" }}>You opted out of this giveaway roll.</span>
                </div>
              ) : currentRoll === 0 ? (
                <div style={{ background: "rgba(168,43,43,0.08)", border: "1px solid rgba(168,43,43,0.3)", borderRadius: "var(--border-radius-md)", padding: "12px 18px", color: "#fca5a5", fontSize: "14px" }}>
                  🔒 <strong>Ineligible (Already Owned)</strong>
                  <span style={{ display: "block", fontSize: "12px", marginTop: "4px" }}>Passed to let players who need the item win.</span>
                </div>
              ) : (
                <div style={{ background: "rgba(26,147,6,0.08)", border: "1px solid rgba(26,147,6,0.3)", borderRadius: "var(--border-radius-md)", padding: "12px 18px", color: "#bbf7d0", fontSize: "14px" }}>
                  🎉 <strong>Submitted Roll: {currentRoll}</strong>
                  <span style={{ display: "block", fontSize: "12px", marginTop: "4px" }}>
                    {hasItem ? "Rolled for fun (already owned, ineligible to win)" : "Official roll submitted! Good luck!"}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", gap: "12px", width: "100%" }}>
              {hasItem ? (
                <>
                  <button
                    className="btn-epic"
                    onClick={handleRoll}
                    style={{ flexGrow: 1, padding: "12px 16px", fontSize: "14px" }}
                  >
                    Roll for Fun
                  </button>
                  <button
                    className="btn-epic btn-crimson"
                    onClick={handlePass}
                    style={{ flexGrow: 1, padding: "12px 16px", fontSize: "14px" }}
                  >
                    Pass Roll
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn-epic"
                    onClick={handleRoll}
                    style={{ flexGrow: 2, padding: "12px 16px", fontSize: "14px" }}
                  >
                    <Dices style={{ width: "16px", height: "16px" }} />
                    Roll D20
                  </button>
                  <button
                    className="btn-epic btn-crimson"
                    onClick={handlePass}
                    style={{ flexGrow: 1, padding: "12px 16px", fontSize: "14px" }}
                  >
                    Pass
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

