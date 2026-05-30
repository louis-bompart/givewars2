"use client";

import React, { useState } from "react";
import { Key, X, ExternalLink, ShieldAlert, Check, HelpCircle, Info } from "lucide-react";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string) => Promise<boolean | string>; // Returns true on success, or an error string on failure
  initialKey?: string;
}

export default function ApiKeyModal({ isOpen, onClose, onSave, initialKey = "" }: ApiKeyModalProps) {
  const [inputKey, setInputKey] = useState(initialKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKey = inputKey.trim();

    if (!trimmedKey) {
      setError("Please paste a Guild Wars 2 API Key.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await onSave(trimmedKey);
      
      if (typeof result === "string") {
        setError(result);
      } else if (result === true) {
        setSuccess(true);
        // Automatically close the modal after 1.5s on successful save
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError("Failed to verify or save your API Key.");
      }
    } catch (err) {
      console.error("Error saving key from modal:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-container gw-card" 
        onClick={(e) => e.stopPropagation()} 
        style={{ padding: "30px" }}
      >
        {/* Header */}
        <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
          <X style={{ width: "20px", height: "20px" }} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <div style={{
            background: "rgba(var(--color-gold-raw), 0.15)",
            borderRadius: "50%",
            width: "40px",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--color-gold)"
          }}>
            <Key style={{ color: "var(--color-gold)", width: "20px", height: "20px" }} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px" }}>Connect GW2 API Key</h2>
            <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "var(--color-text-secondary)" }}>
              Enable automatic inventory & wardrobe eligibility scanning.
            </p>
          </div>
        </div>

        {/* Informational Banner */}
        <div style={{
          display: "flex",
          gap: "10px",
          padding: "12px",
          background: "rgba(244, 176, 36, 0.05)",
          border: "1px solid rgba(244, 176, 36, 0.15)",
          borderRadius: "var(--border-radius-md)",
          marginBottom: "24px",
          fontSize: "13px",
          lineHeight: "1.4"
        }}>
          <Info style={{ color: "var(--color-gold)", width: "18px", height: "18px", minWidth: "18px", marginTop: "2px" }} />
          <span style={{ color: "var(--color-text-primary)" }}>
            GiveWars2 checks if you already own an item when you roll. This ensures rare guild rewards go to players who actually need them!
          </span>
        </div>

        {/* Steps to get key */}
        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ fontSize: "14px", color: "#fff", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "14px" }}>
            How to get an API Key:
          </h3>

          <div className="modal-step">
            <div className="modal-step-number">1</div>
            <div className="modal-step-content">
              Go to the official Guild Wars 2 Applications portal and log in:
              <div style={{ marginTop: "6px" }}>
                <a 
                  href="https://account.arena.net/applications/create" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn-epic"
                  style={{
                    display: "inline-flex",
                    padding: "6px 14px",
                    fontSize: "12px",
                    gap: "6px",
                    width: "fit-content",
                    letterSpacing: "0.5px"
                  }}
                >
                  Create API Key
                  <ExternalLink style={{ width: "12px", height: "12px" }} />
                </a>
              </div>
            </div>
          </div>

          <div className="modal-step">
            <div className="modal-step-number">2</div>
            <div className="modal-step-content">
              Name your key (e.g. <strong>GiveWars2 Activity</strong>) and check the following <strong>Permissions (Scopes)</strong>:
              
              <div className="scope-badge-grid">
                <div className="scope-badge-item">
                  <span className="scope-badge-name">account</span>
                  <span className="scope-badge-desc">Required to verify your display name</span>
                </div>
                <div className="scope-badge-item">
                  <span className="scope-badge-name">inventories</span>
                  <span className="scope-badge-desc">Scans your character bags & bank</span>
                </div>
                <div className="scope-badge-item">
                  <span className="scope-badge-name">unlocks</span>
                  <span className="scope-badge-desc">Scans unlocked skins, dyes, minis</span>
                </div>
                <div className="scope-badge-item" style={{ opacity: 0.7 }}>
                  <span className="scope-badge-name">wallet</span>
                  <span className="scope-badge-desc">Optional (for overall statistics)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-step" style={{ marginBottom: 0 }}>
            <div className="modal-step-number">3</div>
            <div className="modal-step-content">
              Copy the generated key (formatted as `XXXX-XXXX-XXXX...`) and paste it below to register your account!
            </div>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "20px" }}>
          <label className="input-label" htmlFor="modalApiKey">
            Guild Wars 2 API Key
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <input
              id="modalApiKey"
              type="text"
              className="gw-input"
              style={{ fontFamily: "monospace", fontSize: "13px" }}
              placeholder="PASTE-YOUR-API-KEY-HERE..."
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              disabled={loading || success}
            />

            {error && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 12px",
                background: "rgba(168, 43, 43, 0.08)",
                border: "1px solid rgba(168, 43, 43, 0.3)",
                borderRadius: "var(--border-radius-md)",
                color: "#fca5a5",
                fontSize: "13px"
              }}>
                <ShieldAlert style={{ width: "16px", height: "16px", minWidth: "16px" }} />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 12px",
                background: "rgba(26, 147, 6, 0.08)",
                border: "1px solid rgba(26, 147, 6, 0.3)",
                borderRadius: "var(--border-radius-md)",
                color: "#bbf7d0",
                fontSize: "13px"
              }}>
                <Check style={{ width: "16px", height: "16px", minWidth: "16px" }} />
                <span>API Key verified and connected successfully!</span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn-epic btn-crimson"
                style={{ padding: "10px 20px", fontSize: "13px" }}
                onClick={onClose}
                disabled={loading || success}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-epic"
                style={{ padding: "10px 24px", fontSize: "13px" }}
                disabled={loading || success || !inputKey.trim()}
              >
                {loading ? "Verifying..." : success ? "Connected!" : "Connect Key"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
