"use client";

import { useState, useEffect } from "react";

export interface ParticipantRoll {
  userId: string;
  username: string;
  roll: number;
  hasItem: boolean; // Guild Wars 2 inventory status
  timestamp: number;
}

export interface GiveawayItem {
  id: number;
  name: string;
  type: string;
  rarity: string;
  icon: string;
  description: string;
}

export interface ProposedItem extends GiveawayItem {
  proposalId: string;
  proposedBy: string;
  timestamp: number;
}

const STORAGE_KEYS = {
  ITEM: "givewars2_active_item",
  ROLLS: "givewars2_rolls",
  QUEUE: "givewars2_proposal_queue",
};

export function useGiveaway() {
  const [activeItem, setActiveItem] = useState<GiveawayItem | null>(null);
  const [rolls, setRolls] = useState<ParticipantRoll[]>([]);
  const [proposalQueue, setProposalQueue] = useState<ProposedItem[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storedItem = localStorage.getItem(STORAGE_KEYS.ITEM);
      const storedRolls = localStorage.getItem(STORAGE_KEYS.ROLLS);
      const storedQueue = localStorage.getItem(STORAGE_KEYS.QUEUE);

      if (storedItem) {
        setActiveItem(JSON.parse(storedItem));
      }
      if (storedRolls) {
        setRolls(JSON.parse(storedRolls));
      }
      if (storedQueue) {
        setProposalQueue(JSON.parse(storedQueue));
      }
    } catch (e) {
      console.error("Error loading giveaway state from localStorage:", e);
    }
  }, []);

  // Listen for storage changes from other tabs to sync rolls and queue in real-time!
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.ROLLS && e.newValue) {
        try {
          setRolls(JSON.parse(e.newValue));
        } catch (err) {
          console.error("Error parsing storage rolls update:", err);
        }
      }
      if (e.key === STORAGE_KEYS.ITEM) {
        try {
          setActiveItem(e.newValue ? JSON.parse(e.newValue) : null);
        } catch (err) {
          console.error("Error parsing storage item update:", err);
        }
      }
      if (e.key === STORAGE_KEYS.QUEUE && e.newValue) {
        try {
          setProposalQueue(JSON.parse(e.newValue));
        } catch (err) {
          console.error("Error parsing storage queue update:", err);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // Helper to persist queue state
  const saveQueueState = (newQueue: ProposedItem[]) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(newQueue));
    } catch (e) {
      console.error("Error saving queue state to localStorage:", e);
    }
  };

  // Helper to persist state
  const saveState = (item: GiveawayItem | null, newRolls: ParticipantRoll[]) => {
    if (typeof window === "undefined") return;

    try {
      if (item) {
        localStorage.setItem(STORAGE_KEYS.ITEM, JSON.stringify(item));
      } else {
        localStorage.removeItem(STORAGE_KEYS.ITEM);
      }
      localStorage.setItem(STORAGE_KEYS.ROLLS, JSON.stringify(newRolls));
    } catch (e) {
      console.error("Error saving giveaway state to localStorage:", e);
    }
  };

  const startGiveaway = (item: GiveawayItem) => {
    setActiveItem(item);
    setRolls([]);
    saveState(item, []);
  };

  // Propose an item to the collaborative queue
  const proposeItem = async (itemId: number, proposedBy: string) => {
    try {
      const res = await fetch(`/api/gw2/item?id=${itemId}`);
      if (!res.ok) throw new Error("Item not found");
      const itemData = await res.json();
      
      const newProposal: ProposedItem = {
        id: itemData.id,
        name: itemData.name,
        type: itemData.type,
        rarity: itemData.rarity,
        icon: itemData.icon,
        description: itemData.description,
        proposalId: `prop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        proposedBy,
        timestamp: Date.now(),
      };

      setProposalQueue(prev => {
        const next = [...prev, newProposal];
        saveQueueState(next);
        return next;
      });
    } catch (err) {
      console.error("Error proposing item:", err);
      throw err;
    }
  };

  // Launch the oldest item in the queue cooperative FIFO style
  const launchNextProposedItem = () => {
    if (proposalQueue.length === 0) return;
    const nextItem = proposalQueue[0];
    
    // Start active roll event
    startGiveaway({
      id: nextItem.id,
      name: nextItem.name,
      type: nextItem.type,
      rarity: nextItem.rarity,
      icon: nextItem.icon,
      description: nextItem.description
    });
    
    // Remove from queue
    setProposalQueue(prev => {
      const next = prev.slice(1);
      saveQueueState(next);
      return next;
    });
  };

  // Remove a specific proposed item from the local queue (e.g. when consumed by a peer)
  const removeProposedItem = (proposalId: string) => {
    setProposalQueue(prev => {
      const next = prev.filter(p => p.proposalId !== proposalId);
      saveQueueState(next);
      return next;
    });
  };

  const submitRoll = (userId: string, username: string, roll: number, hasItem: boolean) => {
    setRolls(prev => {
      // Check if user already rolled; if so, update their roll
      const index = prev.findIndex(r => r.userId === userId);
      let updatedRolls = [...prev];
      
      const newRoll: ParticipantRoll = {
        userId,
        username,
        roll,
        hasItem,
        timestamp: Date.now(),
      };

      if (index > -1) {
        updatedRolls[index] = newRoll;
      } else {
        updatedRolls.push(newRoll);
      }

      // Sort by roll (descending), then by timestamp (ascending, i.e. whoever rolled first wins tiebreak)
      updatedRolls.sort((a, b) => {
        if (b.roll !== a.roll) {
          return b.roll - a.roll;
        }
        return a.timestamp - b.timestamp;
      });

      saveState(activeItem, updatedRolls);
      return updatedRolls;
    });
  };

  const endGiveaway = () => {
    setActiveItem(null);
    setRolls([]);
    setRollingUsers({});
    saveState(null, []);
  };

  // State to track which users are currently shaking/rolling their dice in the tray
  const [rollingUsers, setRollingUsers] = useState<Record<string, boolean>>({});

  // Function to simulate a mock player's decision (Roll, Pass, or Ineligible) with staggered visual feedback
  const simulateMockDecision = (mockUser: { id: string; username: string }, isForcedOwned = false) => {
    if (!activeItem) return;

    // Check if user already rolled or decided
    const alreadyDecided = rolls.some(r => r.userId === mockUser.id);
    if (alreadyDecided || rollingUsers[mockUser.id]) return;

    // 25% chance they already own the item, unless forced
    const ownsItem = isForcedOwned ? true : Math.random() < 0.25;

    if (ownsItem) {
      // Automatically ineligible due to ownership - roll value 0
      submitRoll(mockUser.id, mockUser.username, 0, true);
      return;
    }

    // 20% chance they choose to pass/decline this item
    const decidesToPass = Math.random() < 0.2;

    // Trigger rolling state for visual shake animation in the tray
    setRollingUsers(prev => ({ ...prev, [mockUser.id]: true }));

    // 1.5 seconds shake time
    setTimeout(() => {
      if (decidesToPass) {
        // Submit as Passed (roll value -1)
        submitRoll(mockUser.id, mockUser.username, -1, false);
      } else {
        // Roll standard D20 (1-20)
        const rollValue = Math.floor(Math.random() * 20) + 1;
        submitRoll(mockUser.id, mockUser.username, rollValue, false);
      }
      
      // Clear rolling state
      setRollingUsers(prev => {
        const next = { ...prev };
        delete next[mockUser.id];
        return next;
      });
    }, 1500);
  };

  // Function to simulate all undecided mock players with realistic staggered timing
  const autoSimulateLobby = (mockRollers: { id: string; username: string }[]) => {
    if (!activeItem) return;

    // Stagger undecided rollers
    const undecided = mockRollers.filter(mr => !rolls.some(r => r.userId === mr.id));
    
    undecided.forEach((mockUser, index) => {
      // Stagger each player's start delay (e.g. 1.2s, 2.5s, 3.8s, etc.)
      const delay = (index + 0.5) * (1000 + Math.random() * 1200);
      setTimeout(() => {
        simulateMockDecision(mockUser);
      }, delay);
    });
  };

  // Curated RPG loot items for automated lobby proposals
  const MOCK_DONATION_ITEMS = [30698, 19675, 92209, 20323, 70051, 89115];
  const MOCK_DONATION_MEMBERS = [
    { id: "mock-r1", username: "LoganThackeray.4321" },
    { id: "mock-r2", username: "ZojjaProdigy.9988" },
    { id: "mock-r3", username: "EirStegalkin.7654" },
    { id: "mock-r4", username: "Canach.2211" },
    { id: "mock-r5", username: "BrahamEirsson.5544" },
    { id: "mock-r6", username: "JennahQueen.1111" }
  ];

  // Periodically simulate a random mock player adding a cool suggestion to the queue when idle (dev mode only)!
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "development") return;

    const interval = setInterval(() => {
      // 25% chance of suggestion every 25 seconds when idle (no active giveaway)
      if (!activeItem && Math.random() < 0.25) {
        const randomMember = MOCK_DONATION_MEMBERS[Math.floor(Math.random() * MOCK_DONATION_MEMBERS.length)];
        const randomItemId = MOCK_DONATION_ITEMS[Math.floor(Math.random() * MOCK_DONATION_ITEMS.length)];
        
        // Ensure not already in queue to prevent excessive cluttering
        const alreadyInQueue = proposalQueue.some(p => p.id === randomItemId);
        if (!alreadyInQueue) {
          proposeItem(randomItemId, randomMember.username.split(".")[0]).catch(() => {});
        }
      }
    }, 25000);

    return () => clearInterval(interval);
  }, [proposalQueue, activeItem]);

  const simulateMockRoll = (mockUser: { id: string; username: string }, isForcedOwned = false) => {
    simulateMockDecision(mockUser, isForcedOwned);
  };

  const getWinner = (): ParticipantRoll | null => {
    // Only players who don't have the item AND made a positive roll (> 0) are eligible to win
    const eligibleRolls = rolls.filter(r => !r.hasItem && r.roll > 0);
    return eligibleRolls.length > 0 ? eligibleRolls[0] : null;
  };

  return {
    activeItem,
    rolls,
    rollingUsers,
    proposalQueue,
    proposeItem,
    launchNextProposedItem,
    startGiveaway,
    submitRoll,
    endGiveaway,
    simulateMockRoll,
    simulateMockDecision,
    autoSimulateLobby,
    setActiveItem,
    setRolls,
    removeProposedItem,
    winner: getWinner(),
  };
}

