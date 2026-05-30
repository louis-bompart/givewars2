"use client";

import React, { useState, useEffect } from "react";
import { Key, Shield, User, Award, Clock, Heart, Sparkles } from "lucide-react";

interface GW2ProfileProps {
  apiKey: string;
  setApiKey: (key: string) => void;
}

interface GW2AccountDetails {
  name: string;
  age: number;
  world: number;
  guilds: string[];
  created: string;
  commander: boolean;
}

export default function GW2Profile({ apiKey, setApiKey }: GW2ProfileProps) {
  const [inputKey, setInputKey] = useState(apiKey);
  const [account, setAccount] = useState<GW2AccountDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlockedCount, setUnlockedCount] = useState<{ skins: number; dyes: number; minis: number; novelties: number }>({
    skins: 0,
    dyes: 0,
    minis: 0,
    novelties: 0,
  });

  // Verify and fetch GW2 Account details when API key is loaded
  useEffect(() => {
    if (!apiKey) {
      setAccount(null);
      return;
    }

    async function fetchGW2Data() {
      setLoading(true);
      setError(null);
      try {
        // Fetch account basic info
        const accResponse = await fetch(`https://api.guildwars2.com/v2/account?access_token=${apiKey}`);
        if (!accResponse.ok) {
          throw new Error("Invalid Guild Wars 2 API Key or API is offline.");
        }
        const accData = await accResponse.json();
        setAccount(accData);

        // Fetch unlock counts to display some cool metrics
        const [skinsRes, dyesRes, minisRes, noveltiesRes] = await Promise.all([
          fetch(`https://api.guildwars2.com/v2/account/skins?access_token=${apiKey}`).catch(() => null),
          fetch(`https://api.guildwars2.com/v2/account/dyes?access_token=${apiKey}`).catch(() => null),
          fetch(`https://api.guildwars2.com/v2/account/minis?access_token=${apiKey}`).catch(() => null),
          fetch(`https://api.guildwars2.com/v2/account/novelties?access_token=${apiKey}`).catch(() => null),
        ]);

        const skins = skinsRes && skinsRes.ok ? await skinsRes.json() : [];
        const dyes = dyesRes && dyesRes.ok ? await dyesRes.json() : [];
        const minis = minisRes && minisRes.ok ? await minisRes.json() : [];
        const novelties = noveltiesRes && noveltiesRes.ok ? await noveltiesRes.json() : [];

        setUnlockedCount({
          skins: Array.isArray(skins) ? skins.length : 0,
          dyes: Array.isArray(dyes) ? dyes.length : 0,
          minis: Array.isArray(minis) ? minis.length : 0,
          novelties: Array.isArray(novelties) ? novelties.length : 0,
        });

      } catch (err) {
        console.error("GW2 fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to load account details");
        setAccount(null);
      } finally {
        setLoading(false);
      }
    }

    fetchGW2Data();
  }, [apiKey]);

  const handleSubmitKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputKey.trim()) {
      setError("Please enter an API key");
      return;
    }
    setApiKey(inputKey.trim());
  };

  const handleClearKey = () => {
    setInputKey("");
    setApiKey("");
    setAccount(null);
    setUnlockedCount({ skins: 0, dyes: 0, minis: 0, novelties: 0 });
  };

  // Convert playtime in seconds to readable hours
  const formatPlaytime = (seconds: number) => {
    return Math.floor(seconds / 3600).toLocaleString();
  };

  return (
    <div className="gw-card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h2 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Shield style={{ color: "var(--color-gold)", width: "24px", height: "24px" }} />
          Guild Wars 2 Integration
        </h2>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginTop: "4px" }}>
          Configure your official Guild Wars 2 API Key. This allows GiveWars2 to automatically check if you already own the items placed in active giveaways!
        </p>
      </div>

      <form onSubmit={handleSubmitKey} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <label className="input-label" htmlFor="apiKey">
            GW2 API Key
          </label>
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              id="apiKey"
              type="text"
              className="gw-input"
              style={{ fontFamily: "monospace", fontSize: "13px" }}
              placeholder="E43E43CC-AF41-004F-8492-..."
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              disabled={loading}
            />
            {apiKey ? (
              <button
                type="button"
                className="btn-epic btn-crimson"
                onClick={handleClearKey}
                style={{ padding: "12px 18px", fontSize: "14px" }}
              >
                Clear
              </button>
            ) : (
              <button
                type="submit"
                className="btn-epic"
                style={{ padding: "12px 24px", fontSize: "14px" }}
                disabled={loading}
              >
                Save
              </button>
            )}
          </div>
        </div>
      </form>

      {loading && (
        <div style={{ color: "var(--color-text-gold)", textAlign: "center", padding: "20px" }}>
          <div className="dice-rolling" style={{ display: "inline-block", marginRight: "10px" }}>🎲</div>
          Connecting to Guild Wars 2 API...
        </div>
      )}

      {error && (
        <div style={{ color: "#ff8a8a", padding: "12px", border: "1px solid rgba(255, 138, 138, 0.2)", borderRadius: "var(--border-radius-md)", background: "rgba(255, 138, 138, 0.05)", fontSize: "14px" }}>
          <strong>Error: </strong> {error}
        </div>
      )}

      {account && !loading && (
        <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div className="avatar-mock" style={{ background: "linear-gradient(135deg, #fbbe24 0%, #a82b2b 100%)", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px" }}>
                <User style={{ color: "#fff", margin: "auto", width: "20px", height: "20px" }} />
              </div>
              <div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff" }}>
                  {account.name}
                </div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                  Account Verified
                </div>
              </div>
            </div>
            {account.commander && (
              <span style={{ background: "rgba(244, 176, 36, 0.15)", border: "1px solid var(--color-gold)", color: "var(--color-text-gold)", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>
                Commander Tag
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
            <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "var(--border-radius-md)", border: "var(--border-glass)", display: "flex", alignItems: "center", gap: "10px" }}>
              <Clock style={{ color: "var(--color-gold)", width: "20px", height: "20px" }} />
              <div>
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Playtime</div>
                <div style={{ fontSize: "15px", fontWeight: "600", color: "#fff" }}>{formatPlaytime(account.age)} hrs</div>
              </div>
            </div>
            
            <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "var(--border-radius-md)", border: "var(--border-glass)", display: "flex", alignItems: "center", gap: "10px" }}>
              <Award style={{ color: "var(--color-gold)", width: "20px", height: "20px" }} />
              <div>
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Unlocked Skins</div>
                <div style={{ fontSize: "15px", fontWeight: "600", color: "#fff" }}>{unlockedCount.skins.toLocaleString()}</div>
              </div>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "var(--border-radius-md)", border: "var(--border-glass)", display: "flex", alignItems: "center", gap: "10px" }}>
              <Heart style={{ color: "var(--color-gold)", width: "20px", height: "20px" }} />
              <div>
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Unlocked Dyes</div>
                <div style={{ fontSize: "15px", fontWeight: "600", color: "#fff" }}>{unlockedCount.dyes.toLocaleString()}</div>
              </div>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "var(--border-radius-md)", border: "var(--border-glass)", display: "flex", alignItems: "center", gap: "10px" }}>
              <Sparkles style={{ color: "var(--color-gold)", width: "20px", height: "20px" }} />
              <div>
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Unlocked Novelties</div>
                <div style={{ fontSize: "15px", fontWeight: "600", color: "#fff" }}>{unlockedCount.novelties.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
