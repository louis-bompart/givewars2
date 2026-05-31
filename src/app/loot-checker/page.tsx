"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useDiscord } from "@/hooks/useDiscord";
import { 
  ArrowLeft, 
  Search, 
  Key, 
  TrendingUp, 
  Layers, 
  Sparkles, 
  AlertTriangle, 
  HelpCircle, 
  CheckCircle2, 
  Lock, 
  RefreshCw, 
  Users,
  Compass
} from "lucide-react";

interface GuildMemberBreakdown {
  userId: string;
  username: string;
  gw2Account: string;
}

interface ScanResultItem {
  itemId: number;
  itemIds: number[];
  unlockType: "skin" | "dye" | "mini" | "novelty" | "recipe" | "inventory";
  unlockId: number;
  name: string;
  icon: string;
  rarity: string;
  type: string;
  count: number;
  description: string;
  demandCount: number;
  totalChecked: number;
  whoNeeds: GuildMemberBreakdown[];
  whoOwns: GuildMemberBreakdown[];
}

// Immersive RPG loading flavor texts
const LOADING_FLAVOR_TEXTS = [
  "Opening Bank Vault gates...",
  "Scrubbing shared inventory bags...",
  "Querying Lady Kasmeer's dye wardrobe...",
  "Scanning Tribune Brimstone's armor rack...",
  "Reviewing Prodigy Taimi's novelty toybox...",
  "Calculating cooperative demand indices...",
  "Matching skins with default item templates...",
  "Assembling loot priority matrices...",
  "Preparing epic giveaway suggestions..."
];

export default function LootCheckerPage() {
  const { isInDiscord, user, changeMockUser, mockUsers } = useDiscord();

  // API Key state (synced with db/localStorage)
  const [apiKey, setApiKey] = useState("");
  const [inputKey, setInputKey] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(true);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [linkingSuccess, setLinkingSuccess] = useState(false);

  // Scan & Results state
  const [scanning, setScanning] = useState(false);
  const [items, setItems] = useState<ScanResultItem[]>([]);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);

  // Sorting & Filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"demand" | "rarity" | "name" | "count">("demand");

  // Accordion expands
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);

  // Dynamic flavor text index
  const [flavorIndex, setFlavorIndex] = useState(0);

  // 1. Sync API Key on mount/user change
  useEffect(() => {
    if (!user) {
      setApiKeyLoading(false);
      return;
    }

    const userId = user.id;
    // Fast local storage load
    const localKey = localStorage.getItem("gw2_api_key") || "";
    setApiKey(localKey);
    setInputKey(localKey);

    async function fetchDbKey() {
      setApiKeyLoading(true);
      try {
        const response = await fetch(`/api/gw2/apikey?userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.apiKey !== undefined) {
            setApiKey(data.apiKey);
            setInputKey(data.apiKey);
            if (data.apiKey) {
              localStorage.setItem("gw2_api_key", data.apiKey);
            } else {
              localStorage.removeItem("gw2_api_key");
            }
          }
        }
      } catch (err) {
        console.error("Failed to load API key from database:", err);
      } finally {
        setApiKeyLoading(false);
      }
    }

    fetchDbKey();
  }, [user]);

  // 2. Cycle loading flavor texts during scan
  useEffect(() => {
    if (!scanning) return;
    const interval = setInterval(() => {
      setFlavorIndex((prev) => (prev + 1) % LOADING_FLAVOR_TEXTS.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [scanning]);

  // 3. Handle linking/saving API key
  const handleLinkApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyVal = inputKey.trim();
    if (!keyVal) {
      setApiKeyError("Please enter a valid API Key");
      return;
    }

    setApiKeyLoading(true);
    setApiKeyError(null);
    setLinkingSuccess(false);

    try {
      // Direct POST API call (mimics GW2Profile)
      const res = await fetch("/api/gw2/apikey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.id,
          username: user?.username,
          apiKey: keyVal,
        }),
      });

      if (res.ok) {
        setApiKey(keyVal);
        localStorage.setItem("gw2_api_key", keyVal);
        setLinkingSuccess(true);
        setTimeout(() => setLinkingSuccess(false), 3000);
      } else {
        const errData = await res.json();
        setApiKeyError(errData.error || "Failed to verify or save your API key. Check the key details.");
      }
    } catch (err) {
      console.error(err);
      setApiKeyError("Could not contact the database. Verify your internet connection.");
    } finally {
      setApiKeyLoading(false);
    }
  };

  // 4. Handle vault scanning trigger
  const handleScanInventory = async () => {
    if (!user) return;
    setScanning(true);
    setScanError(null);
    setScanMessage(null);
    setFlavorIndex(0);

    try {
      const res = await fetch("/api/gw2/check-loot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setItems(data.items || []);
        setScanMessage(data.message || null);
        setHasScanned(true);
        // Clear expand state
        setExpandedItemId(null);
      } else {
        setScanError(data.error || "Failed to complete full vault matching. Try again.");
      }
    } catch (err) {
      console.error(err);
      setScanError("Failed to reach Guild Wars 2 API. Check if your API Key supports the 'inventories' and 'unlocks' scopes.");
    } finally {
      setScanning(false);
    }
  };

  // Toggle single row expand
  const toggleRowExpand = (itemId: number) => {
    setExpandedItemId((prev) => (prev === itemId ? null : itemId));
  };

  // 5. Filter and Sort logic
  const filteredAndSortedItems = useMemo(() => {
    let result = [...items];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.name.toLowerCase().includes(query) || 
        item.type.toLowerCase().includes(query) ||
        item.rarity.toLowerCase().includes(query)
      );
    }

    // Sort by selection
    const rarities = ["Junk", "Basic", "Fine", "Masterwork", "Rare", "Exotic", "Ascended", "Legendary"];
    
    result.sort((a, b) => {
      if (sortBy === "demand") {
        return b.demandCount - a.demandCount;
      }
      if (sortBy === "rarity") {
        return rarities.indexOf(b.rarity) - rarities.indexOf(a.rarity);
      }
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "count") {
        return b.count - a.count;
      }
      return 0;
    });

    return result;
  }, [items, searchQuery, sortBy]);

  if (apiKeyLoading && !hasScanned) {
    return (
      <div className="flex-center" style={{ minHeight: "100vh", backgroundColor: "var(--color-bg-dark)", color: "var(--color-text-gold)", gap: "16px" }}>
        <div className="dice-rolling" style={{ fontSize: "40px" }}>🎲</div>
        <div style={{ fontFamily: "var(--font-header)", letterSpacing: "2px", fontSize: "18px" }}>LOADING SECURITY PERMISSIONS...</div>
        <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Verifying linked API tokens</div>
      </div>
    );
  }

  return (
    <div className="hud-viewport" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Glow Top Accent */}
      <div className="hud-grid-accent" />

      {/* Top Banner Navigation */}
      <header className="hud-top-bar" style={{ padding: "16px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/" className="btn-epic btn-crimson" style={{ padding: "8px 16px", fontSize: "12px", textDecoration: "none", boxShadow: "none" }}>
            <ArrowLeft style={{ width: "14px", height: "14px", marginRight: "6px" }} />
            Back to Roll HUD
          </Link>
          <div style={{ borderLeft: "1px solid rgba(255,255,255,0.08)", paddingLeft: "16px" }}>
            <h1 style={{ margin: 0, fontSize: "20px", fontFamily: "var(--font-header)", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
              Loot Helper
              <span style={{ fontSize: "9px", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "1px 4px", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "1px", verticalAlign: "middle" }}>
                Vault Scanner
              </span>
            </h1>
            <p style={{ margin: 0, fontSize: "11px", color: "var(--color-text-secondary)" }}>
              Find which items in your bank and vaults help unlock guild mates' collections!
            </p>
          </div>
        </div>

        {/* User Identity Mock Selector for Local Dev */}
        {process.env.NODE_ENV === "development" && !isInDiscord && user && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(0,0,0,0.5)", border: "var(--border-gold)", borderRadius: "8px", padding: "4px 10px" }}>
            <span style={{ fontSize: "11px", color: "var(--color-text-gold)", fontWeight: "600" }}>Identity:</span>
            <select
              style={{
                background: "transparent",
                color: "#fff",
                border: "none",
                fontSize: "11px",
                fontFamily: "var(--font-body)",
                outline: "none",
                cursor: "pointer"
              }}
              value={JSON.stringify(user)}
              onChange={(e) => {
                const selected = JSON.parse(e.target.value);
                changeMockUser(selected);
                setItems([]);
                setHasScanned(false);
              }}
            >
              {mockUsers.map((mu) => (
                <option key={mu.id} value={JSON.stringify(mu)} style={{ background: "#111" }}>
                  {mu.globalName || mu.username}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="app-container" style={{ flexGrow: 1, padding: "24px", maxWidth: "900px", width: "100%" }}>
        
        {/* API KEY GUARD PANEL */}
        {!apiKey ? (
          <div className="gw-card flex-center" style={{ padding: "40px 24px", textAlign: "center", maxWidth: "600px", margin: "40px auto 0 auto" }}>
            <div style={{
              background: "linear-gradient(135deg, rgba(var(--color-gold-raw), 0.2) 0%, rgba(var(--color-gold-raw), 0.05) 100%)",
              border: "var(--border-gold)",
              borderRadius: "50%",
              width: "80px",
              height: "80px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "24px",
              boxShadow: "var(--shadow-gold)"
            }}>
              <Lock style={{ width: "36px", height: "36px", color: "var(--color-text-gold)" }} />
            </div>

            <h2 style={{ fontSize: "24px", margin: "0 0 8px 0" }}>Vault Lock Engaged</h2>
            <div style={{ fontSize: "11px", background: "rgba(239, 68, 68, 0.15)", color: "#fca5a5", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "2px 8px", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "20px", fontWeight: "600" }}>
              API KEY LINK REQUIRED
            </div>

            <p style={{ color: "var(--color-text-primary)", fontSize: "14px", lineHeight: "1.6", margin: "0 0 24px 0", maxWidth: "450px" }}>
              To check if the extra items in your vault could help other guild mates, we must securely fetch your account holdings. Enter your official Guild Wars 2 API Key below.
            </p>

            {apiKeyError && (
              <div style={{ width: "100%", maxWidth: "400px", color: "#ff8a8a", padding: "12px", border: "1px solid rgba(255, 138, 138, 0.2)", borderRadius: "var(--border-radius-md)", background: "rgba(255, 138, 138, 0.05)", fontSize: "13px", marginBottom: "16px", textAlign: "left" }}>
                <strong>Error: </strong> {apiKeyError}
              </div>
            )}

            {linkingSuccess && (
              <div style={{ width: "100%", maxWidth: "400px", color: "#86efac", padding: "12px", border: "1px solid rgba(74, 222, 128, 0.2)", borderRadius: "var(--border-radius-md)", background: "rgba(74, 222, 128, 0.05)", fontSize: "13px", marginBottom: "16px", textAlign: "left" }}>
                <strong>Success: </strong> API Key successfully synchronized! Ready to scan.
              </div>
            )}

            <form onSubmit={handleLinkApiKey} style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%", maxWidth: "400px" }}>
              <div style={{ textAlign: "left" }}>
                <label className="input-label" htmlFor="chkApiKey" style={{ fontSize: "11px" }}>
                  Official GW2 API Key (inventories & unlocks scopes required)
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    id="chkApiKey"
                    type="text"
                    className="gw-input"
                    style={{ fontFamily: "monospace", fontSize: "13px", paddingTop: "10px", paddingBottom: "10px" }}
                    placeholder="E43E43CC-AF41-004F-8492-..."
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                  />
                  <button type="submit" className="btn-epic" style={{ padding: "10px 18px", fontSize: "13px", whiteSpace: "nowrap" }}>
                    Link Key
                  </button>
                </div>
              </div>

              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "16px", marginTop: "8px" }}>
                🔑 Need a key? Create one with <strong style={{ color: "#fff" }}>inventories, progression, unlocks</strong> scopes enabled on the official <a href="https://account.arena.net/applications" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-text-gold)", textDecoration: "underline" }}>Guild Wars 2 Account Portal</a>.
              </div>
            </form>
          </div>
        ) : (
          /* LOOT SCANNER PANEL */
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            
            {/* SCAN CONTROL HEADER CARD */}
            <div className="gw-card" style={{ display: "flex", flexDirection: "column", gap: "20px", position: "relative" }}>
              <div>
                <h2 style={{ display: "flex", alignItems: "center", gap: "10px", margin: 0, fontSize: "20px" }}>
                  <Compass style={{ color: "var(--color-gold)", width: "24px", height: "24px" }} />
                  Cooperative Vault Scanner
                </h2>
                <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginTop: "4px" }}>
                  Check which weapons, armors, dyes, and minis in your vaults can help unlock others' collections.
                </p>
              </div>

              {scanError && (
                <div style={{ color: "#ff8a8a", padding: "12px", border: "1px solid rgba(255, 138, 138, 0.2)", borderRadius: "var(--border-radius-md)", background: "rgba(255, 138, 138, 0.05)", fontSize: "13px" }}>
                  <strong style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <AlertTriangle style={{ width: "16px", height: "16px" }} />
                    Vault Scan Error
                  </strong>
                  <p style={{ margin: "6px 0 0 0", color: "var(--color-text-primary)", fontSize: "12px", lineHeight: "1.4" }}>{scanError}</p>
                </div>
              )}

              {/* API Scope Notification */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255, 255, 255, 0.02)", padding: "12px 16px", borderRadius: "8px", border: "var(--border-glass)", flexWrap: "wrap", gap: "12px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Lock style={{ width: "13px", height: "13px", color: "var(--color-gold)" }} />
                  Linked Account: <strong style={{ color: "#fff" }}>{user?.globalName || user?.username}</strong>
                </span>
                <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", display: "inline-block", background: "rgba(244, 176, 36, 0.08)", border: "1px solid rgba(244, 176, 36, 0.2)", padding: "2px 8px", borderRadius: "20px" }}>
                  Active Scopes: bank, inventories, unlocks, progression
                </span>
              </div>

              {/* SCAN TRIGER BUTTON */}
              {!scanning && (
                <button
                  className="btn-epic"
                  onClick={handleScanInventory}
                  style={{ width: "100%", padding: "16px 24px", fontSize: "15px", letterSpacing: "2px" }}
                >
                  <Sparkles style={{ width: "18px", height: "18px", fill: "currentColor" }} />
                  {hasScanned ? "Scan Vault & Bags Again" : "Scan My Vault & Bags Now"}
                </button>
              )}

              {/* RPG CYCLIC LOADER */}
              {scanning && (
                <div style={{
                  background: "radial-gradient(circle at center, rgba(var(--color-gold-raw), 0.05) 0%, rgba(0,0,0,0.4) 100%)",
                  border: "1px solid rgba(var(--color-gold-raw), 0.3)",
                  borderRadius: "var(--border-radius-md)",
                  padding: "30px 20px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "16px",
                  boxShadow: "var(--shadow-gold)"
                }}>
                  {/* Rotating Glowing D20 */}
                  <div className="dice-rolling" style={{ fontSize: "44px", filter: "drop-shadow(0 0 15px rgba(var(--color-gold-raw), 0.6))" }}>
                    🎲
                  </div>
                  
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                    <div style={{ fontFamily: "var(--font-header)", letterSpacing: "1.5px", fontSize: "15px", color: "var(--color-text-gold)" }}>
                      RUNNING DEEP COLLECTIVE SCAN
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--color-text-primary)", fontStyle: "italic", animation: "pulse 1.5s infinite" }}>
                      &ldquo;{LOADING_FLAVOR_TEXTS[flavorIndex]}&rdquo;
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SCAN RESULTS AREA */}
            {hasScanned && !scanning && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                
                {/* METRICS & FILTERS BOX */}
                <div className="gw-card" style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", background: "rgba(0,0,0,0.3)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyItems: "center" }}>
                      <CheckCircle2 style={{ width: "16px", height: "16px", margin: "auto" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff" }}>
                        {filteredAndSortedItems.length} shareable unlocks found
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                        {scanMessage || "Filtered out all items everyone already has."}
                      </div>
                    </div>
                  </div>

                  {/* Search and Sort controls */}
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", flexGrow: 1, justifyContent: "flex-end", maxWidth: "550px" }}>
                    {/* Search filter input */}
                    <div style={{ position: "relative", flexGrow: 1, minWidth: "150px" }}>
                      <Search style={{ position: "absolute", left: "10px", top: "9px", width: "14px", height: "14px", color: "var(--color-text-secondary)" }} />
                      <input
                        type="text"
                        className="gw-input"
                        style={{ paddingLeft: "30px", paddingTop: "7px", paddingBottom: "7px", fontSize: "12px" }}
                        placeholder="Search items..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>

                    {/* Sort by selection dropdown */}
                    <div style={{ position: "relative", minWidth: "140px" }}>
                      <select
                        className="gw-input"
                        style={{ paddingTop: "7px", paddingBottom: "7px", fontSize: "12px", cursor: "pointer" }}
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                      >
                        <option value="demand">Sort: Highest Demand</option>
                        <option value="rarity">Sort: Rarity</option>
                        <option value="name">Sort: Name (A-Z)</option>
                        <option value="count">Sort: Quantity</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* DYNAMIC RESULTS ROW */}
                {filteredAndSortedItems.length === 0 ? (
                  <div className="gw-card flex-center" style={{ padding: "40px", color: "var(--color-text-secondary)", minHeight: "200px" }}>
                    <CheckCircle2 style={{ width: "48px", height: "48px", opacity: 0.15, color: "#10b981", marginBottom: "12px" }} />
                    <span style={{ fontSize: "15px", fontWeight: "600", color: "#fff" }}>No shareable items found!</span>
                    <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", textAlign: "center", maxWidth: "400px", margin: "6px 0 0 0" }}>
                      Either your search query filtered out everything, or there are no unlockable items in your vault that other guild mates actually need. What an unlocked guild!
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {filteredAndSortedItems.map((item) => {
                      const isExpanded = expandedItemId === item.itemId;
                      const rarityClass = `rarity-${item.rarity || "Basic"}`;
                      const demandPercent = Math.round((item.demandCount / item.totalChecked) * 100);
                      
                      // Demand categorization label
                      let demandLabel = "Moderate Demand";
                      let badgeGlowColor = "rgba(var(--color-gold-raw), 0.15)";
                      if (demandPercent >= 75) {
                        demandLabel = "CRITICAL DEMAND";
                        badgeGlowColor = "rgba(168, 43, 43, 0.4)";
                      } else if (demandPercent >= 40) {
                        demandLabel = "HIGH DEMAND";
                        badgeGlowColor = "rgba(var(--color-gold-raw), 0.3)";
                      } else {
                        demandLabel = "LOW DEMAND";
                        badgeGlowColor = "rgba(255,255,255,0.03)";
                      }

                      return (
                        <div
                          key={item.itemId}
                          className={`gw-card ${rarityClass}`}
                          style={{
                            padding: "0",
                            borderLeft: "5px solid var(--rarity-color, #a09789)",
                            borderColor: "var(--border-glass)",
                            cursor: "pointer",
                            overflow: "visible",
                            boxShadow: isExpanded ? "0 10px 30px rgba(0,0,0,0.6), var(--shadow-gold)" : "none",
                            transition: "all 0.2s"
                          }}
                          onClick={() => toggleRowExpand(item.itemId)}
                        >
                          {/* Top Card Row */}
                          <div style={{
                            padding: "16px 20px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "16px"
                          }}>
                            {/* Left details */}
                            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                              <div className="gw2-item-icon-container" style={{ width: "42px", height: "42px", flexShrink: 0 }}>
                                <img src={item.icon || "/placeholder.png"} alt={item.name} className="gw2-item-icon" />
                                {item.count > 1 && (
                                  <span style={{
                                    position: "absolute",
                                    bottom: "2px",
                                    right: "2px",
                                    background: "#111",
                                    color: "var(--color-text-gold)",
                                    border: "1px solid var(--color-gold)",
                                    borderRadius: "3px",
                                    fontSize: "10px",
                                    fontWeight: "800",
                                    padding: "0 3px",
                                    lineHeight: "1.2"
                                  }}>
                                    x{item.count}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <span className="gw2-item-name" style={{ fontSize: "16px", color: "var(--rarity-color, #fff)" }}>
                                  {item.name}
                                </span>
                                <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                                  {item.type} • {item.rarity}
                                </span>
                              </div>
                            </div>

                            {/* Right demand badge */}
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <span style={{
                                fontSize: "10px",
                                border: "1px solid rgba(var(--color-gold-raw), 0.3)",
                                background: badgeGlowColor,
                                color: "var(--color-text-gold)",
                                padding: "3px 8px",
                                borderRadius: "4px",
                                fontWeight: "700",
                                letterSpacing: "0.5px"
                              }}>
                                {demandLabel}
                              </span>
                              <div style={{
                                fontSize: "14px",
                                fontWeight: "700",
                                color: "#4ade80",
                                textShadow: "0 0 10px rgba(74, 222, 128, 0.4)",
                                background: "rgba(74, 222, 128, 0.08)",
                                border: "1px solid rgba(74, 222, 128, 0.2)",
                                padding: "4px 10px",
                                borderRadius: "20px"
                              }}>
                                Needed by {item.demandCount} {item.demandCount === 1 ? "mate" : "mates"}
                              </div>
                            </div>
                          </div>

                          {/* Expanded Details Drawer */}
                          {isExpanded && (
                            <div
                              style={{
                                padding: "20px",
                                background: "rgba(0, 0, 0, 0.35)",
                                borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                                borderBottomLeftRadius: "var(--border-radius-lg)",
                                borderBottomRightRadius: "var(--border-radius-lg)",
                                display: "flex",
                                flexDirection: "column",
                                gap: "18px"
                              }}
                              onClick={(e) => e.stopPropagation()} // Stop triggering expand toggle on sub-clicks
                            >
                              {/* Rarity & description */}
                              <div>
                                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                                  Item Description
                                </div>
                                <p style={{ color: "var(--color-text-primary)", fontSize: "13px", margin: 0, lineHeight: "1.5" }}>
                                  {item.description || "No description provided."}
                                </p>
                              </div>

                              {/* Unlock mapping notice */}
                              <div style={{ fontSize: "11px", background: "rgba(255, 255, 255, 0.02)", border: "var(--border-glass)", padding: "8px 12px", borderRadius: "6px", color: "var(--color-text-secondary)" }}>
                                💡 Matches: <strong style={{ color: "#fff" }}>{item.unlockType.toUpperCase()}</strong> ID <strong style={{ color: "var(--color-text-gold)" }}>#{item.unlockId}</strong>. 
                                {item.itemIds.length > 1 && ` Combined ${item.itemIds.length} duplicate bank items matching this identical unlock skin.`}
                              </div>

                              {/* Members breakdown split grid */}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
                                
                                {/* Who Needs It (Green) */}
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#4ade80", display: "inline-block" }}></span>
                                    <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "#4ade80", letterSpacing: "0.5px" }}>
                                      Who Needs It ({item.whoNeeds.length})
                                    </span>
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    {item.whoNeeds.map(mate => (
                                      <div key={mate.userId} style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        background: "rgba(74, 222, 128, 0.04)",
                                        border: "1px solid rgba(74, 222, 128, 0.15)",
                                        padding: "8px 12px",
                                        borderRadius: "6px",
                                        fontSize: "12px"
                                      }}>
                                        <span style={{ color: "#fff", fontWeight: 600 }}>{mate.username}</span>
                                        <span style={{ color: "var(--color-text-secondary)", fontFamily: "monospace" }}>{mate.gw2Account}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Who Already Has It (Crimson/Red) */}
                                {item.whoOwns.length > 0 && (
                                  <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#ef4444", display: "inline-block" }}></span>
                                      <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--color-text-secondary)", letterSpacing: "0.5px" }}>
                                        Who Already Has It ({item.whoOwns.length})
                                      </span>
                                    </div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                      {item.whoOwns.map(mate => (
                                        <div key={mate.userId} style={{
                                          background: "rgba(255, 255, 255, 0.02)",
                                          border: "var(--border-glass)",
                                          padding: "5px 10px",
                                          borderRadius: "4px",
                                          fontSize: "11px",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "6px"
                                        }}>
                                          <span style={{ color: "var(--color-text-secondary)" }}>{mate.username}</span>
                                          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "9px" }}>({mate.gw2Account})</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* FIRST LOAD SCAN INVITATION */}
            {!hasScanned && !scanning && (
              <div className="gw-card flex-center" style={{ padding: "50px 20px", textAlign: "center", background: "radial-gradient(circle at center, rgba(var(--color-gold-raw), 0.04) 0%, rgba(0,0,0,0.3) 100%)" }}>
                <Compass style={{ width: "50px", height: "50px", opacity: 0.15, color: "var(--color-gold)", marginBottom: "16px" }} />
                <h3 style={{ fontSize: "18px", margin: "0 0 6px 0", color: "#fff" }}>Ready to Scan your Inventories</h3>
                <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", maxWidth: "450px", margin: 0, lineHeight: "1.5" }}>
                  Your API Key is loaded and secure. Click the scan button above. We will fetch your bank items, translate them to skins/dyes/minis, and evaluate what other guild members need!
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Guild Footer */}
      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} GiveWars2. Immersive cooperative guild activity portal.</p>
      </footer>
    </div>
  );
}
