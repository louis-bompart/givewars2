"use client";

import { useEffect, useRef, useState } from "react";
import { ProposedItem } from "./useGiveaway";

interface WebRTCProps {
  instanceId: string | null;
  userId: string | null;
  username: string | null;
  localQueue: ProposedItem[];
  onQueueUpdate: (peerUserId: string, queue: ProposedItem[]) => void;
  onRoll: (peerUserId: string, username: string, roll: number, hasItem: boolean) => void;
  onActiveItem: (item: any) => void;
  onEndGiveaway: () => void;
  onConsumeProposal: (proposalId: string) => void;
}

export function useWebRTC({
  instanceId,
  userId,
  username,
  localQueue,
  onQueueUpdate,
  onRoll,
  onActiveItem,
  onEndGiveaway,
  onConsumeProposal,
}: WebRTCProps) {
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const dataChannels = useRef<Record<string, RTCDataChannel>>({});
  const pendingCandidates = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const localQueueRef = useRef<ProposedItem[]>(localQueue);

  // Keep localQueueRef up to date so we always broadcast the latest version
  useEffect(() => {
    localQueueRef.current = localQueue;
  }, [localQueue]);

  // STUN Servers for ICE gathering (free public Google STUN servers)
  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  };

  // Helper to send a signaling message immediately to the backend
  const sendSignal = async (to: string, type: string, payload: any) => {
    if (!instanceId || !userId || !username) return;
    try {
      await fetch("/api/lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId,
          userId,
          username,
          signals: [
            {
              to,
              type,
              payload: typeof payload === "string" ? payload : JSON.stringify(payload),
            },
          ],
        }),
      });
    } catch (err) {
      console.error(`Failed to send ${type} signal to ${to}:`, err);
    }
  };

  // Helper to construct a new RTCPeerConnection and register its callbacks
  const createPeerConnection = (peerUserId: string): RTCPeerConnection => {
    if (peerConnections.current[peerUserId]) {
      return peerConnections.current[peerUserId];
    }

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections.current[peerUserId] = pc;
    pendingCandidates.current[peerUserId] = [];

    // 1. Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(peerUserId, "candidate", event.candidate.toJSON());
      }
    };

    // 2. Handle Connection State Changes
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${peerUserId}:`, pc.connectionState);
      if (pc.connectionState === "connected") {
        setConnectedPeers((prev) => [...new Set([...prev, peerUserId])]);
      } else if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        cleanupPeer(peerUserId);
      }
    };

    return pc;
  };

  // Helper to set up Data Channel event handlers
  const setupDataChannel = (peerUserId: string, channel: RTCDataChannel) => {
    dataChannels.current[peerUserId] = channel;

    channel.onopen = () => {
      console.log(`[WebRTC] Data channel OPENED with ${peerUserId}`);
      // Send our current local queue immediately upon connection!
      if (localQueueRef.current.length > 0) {
        channel.send(
          JSON.stringify({
            type: "queue-sync",
            data: localQueueRef.current,
          })
        );
      }
    };

    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "queue-sync") {
          onQueueUpdate(peerUserId, message.data);
        } else if (message.type === "dice-roll") {
          const { username: peerUser, roll, hasItem } = message.data;
          onRoll(peerUserId, peerUser, roll, hasItem);
        } else if (message.type === "active-item") {
          onActiveItem(message.data);
        } else if (message.type === "end-giveaway") {
          onEndGiveaway();
        } else if (message.type === "consume-proposal") {
          onConsumeProposal(message.data.proposalId);
        }
      } catch (err) {
        console.error("Failed to parse incoming data channel message:", err);
      }
    };

    channel.onclose = () => {
      console.log(`[WebRTC] Data channel CLOSED with ${peerUserId}`);
      cleanupPeer(peerUserId);
    };
  };

  // Clean up a specific disconnected peer
  const cleanupPeer = (peerUserId: string) => {
    if (dataChannels.current[peerUserId]) {
      try {
        dataChannels.current[peerUserId].close();
      } catch {}
      delete dataChannels.current[peerUserId];
    }

    if (peerConnections.current[peerUserId]) {
      try {
        peerConnections.current[peerUserId].close();
      } catch {}
      delete peerConnections.current[peerUserId];
    }

    delete pendingCandidates.current[peerUserId];
    setConnectedPeers((prev) => prev.filter((id) => id !== peerUserId));
    onQueueUpdate(peerUserId, []); // Flush their offered items from visual layout
  };

  // Broadcast local queue changes to all active peers
  const broadcastQueue = (queue: ProposedItem[]) => {
    const payload = JSON.stringify({ type: "queue-sync", data: queue });
    Object.entries(dataChannels.current).forEach(([peerId, channel]) => {
      if (channel.readyState === "open") {
        try {
          channel.send(payload);
        } catch (err) {
          console.error(`Failed to broadcast queue to ${peerId}:`, err);
        }
      }
    });
  };

  // Broadcast a dice roll to all active peers
  const broadcastRoll = (rollUsername: string, rollValue: number, hasItem: boolean) => {
    const payload = JSON.stringify({
      type: "dice-roll",
      data: { username: rollUsername, roll: rollValue, hasItem },
    });
    Object.entries(dataChannels.current).forEach(([peerId, channel]) => {
      if (channel.readyState === "open") {
        try {
          channel.send(payload);
        } catch (err) {
          console.error(`Failed to broadcast roll to ${peerId}:`, err);
        }
      }
    });
  };

  // Broadcast the active item when a giveaway is started
  const broadcastActiveItem = (item: any) => {
    const payload = JSON.stringify({ type: "active-item", data: item });
    Object.entries(dataChannels.current).forEach(([peerId, channel]) => {
      if (channel.readyState === "open") {
        try {
          channel.send(payload);
        } catch (err) {
          console.error(`Failed to broadcast active item to ${peerId}:`, err);
        }
      }
    });
  };

  // Broadcast when a giveaway is ended by the organizer
  const broadcastEndGiveaway = () => {
    const payload = JSON.stringify({ type: "end-giveaway" });
    Object.entries(dataChannels.current).forEach(([peerId, channel]) => {
      if (channel.readyState === "open") {
        try {
          channel.send(payload);
        } catch (err) {
          console.error(`Failed to broadcast end giveaway to ${peerId}:`, err);
        }
      }
    });
  };

  // Broadcast when a proposal is consumed from the queue
  const broadcastConsumeProposal = (proposalId: string) => {
    const payload = JSON.stringify({ type: "consume-proposal", data: { proposalId } });
    Object.entries(dataChannels.current).forEach(([peerId, channel]) => {
      if (channel.readyState === "open") {
        try {
          channel.send(payload);
        } catch (err) {
          console.error(`Failed to broadcast consume proposal to ${peerId}:`, err);
        }
      }
    });
  };

  // Heartbeat, peer discovery, and signal processing loop
  useEffect(() => {
    if (!instanceId || !userId || !username) return;

    let isMounted = true;
    let pollInterval: NodeJS.Timeout;

    const performLobbyHeartbeat = async () => {
      try {
        const response = await fetch("/api/lobby", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instanceId,
            userId,
            username,
            signals: [], // Heartbeats don't send active signals unless queued
          }),
        });

        if (!response.ok || !isMounted) return;

        const { participants, signals } = await response.json();

        // 1. Process active peer list and handle removals
        const activeUserIds: string[] = (participants || [])
          .map((p: any) => p.userId)
          .filter((id: string) => id !== userId);

        // Cleanup any peer that is no longer active in the database lobby
        Object.keys(peerConnections.current).forEach((peerId) => {
          if (!activeUserIds.includes(peerId)) {
            console.log(`[WebRTC] Peer ${peerId} went inactive, cleaning up.`);
            cleanupPeer(peerId);
          }
        });

        // 2. Initiate connections with newer peers
        // Connection rule: lexicographically larger ID initiates connection to lower ID
        for (const peer of participants || []) {
          const peerId = peer.userId;
          if (peerId === userId) continue;

          // If not connected and we are the designated initiator
          if (!peerConnections.current[peerId] && userId > peerId) {
            console.log(`[WebRTC] Initiating P2P connection to ${peerId} (${peer.username})`);
            const pc = createPeerConnection(peerId);

            // Create outbound data channel
            const channel = pc.createDataChannel("giveaway-sync");
            setupDataChannel(peerId, channel);

            // Create Offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Send signaling offer
            await sendSignal(peerId, "offer", offer.sdp);
          }
        }

        // 3. Process incoming signaling messages
        for (const sig of signals || []) {
          const peerId = sig.from;
          if (sig.type === "offer") {
            console.log(`[WebRTC] Received offer from ${peerId}`);
            const pc = createPeerConnection(peerId);

            // Listen for data channel created by initiator
            pc.ondatachannel = (event) => {
              setupDataChannel(peerId, event.channel);
            };

            await pc.setRemoteDescription(
              new RTCSessionDescription({ type: "offer", sdp: sig.payload })
            );

            // Process any ICE candidates received before the offer description was set
            const candidates = pendingCandidates.current[peerId] || [];
            for (const cand of candidates) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.error("Error adding queued ICE candidate:", e);
              }
            }
            pendingCandidates.current[peerId] = [];

            // Create Answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // Send signaling answer
            await sendSignal(peerId, "answer", answer.sdp);

          } else if (sig.type === "answer") {
            console.log(`[WebRTC] Received answer from ${peerId}`);
            const pc = peerConnections.current[peerId];
            if (pc) {
              await pc.setRemoteDescription(
                new RTCSessionDescription({ type: "answer", sdp: sig.payload })
              );

              // Process any ICE candidates received before answer was set
              const candidates = pendingCandidates.current[peerId] || [];
              for (const cand of candidates) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch (e) {
                  console.error("Error adding queued ICE candidate:", e);
                }
              }
              pendingCandidates.current[peerId] = [];
            }

          } else if (sig.type === "candidate") {
            const candidateData = JSON.parse(sig.payload);
            const pc = peerConnections.current[peerId];

            if (pc && pc.remoteDescription) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(candidateData));
              } catch (e) {
                console.error("Error adding ICE candidate:", e);
              }
            } else {
              // Remote description not ready, queue it
              if (!pendingCandidates.current[peerId]) {
                pendingCandidates.current[peerId] = [];
              }
              pendingCandidates.current[peerId].push(candidateData);
            }
          }
        }
      } catch (err) {
        console.error("Error in P2P discovery heartbeat loop:", err);
      }
    };

    // Run immediately, then poll every 8 seconds
    performLobbyHeartbeat();
    pollInterval = setInterval(performLobbyHeartbeat, 8000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      // Clean up all active connections when unmounting
      Object.keys(peerConnections.current).forEach((peerId) => cleanupPeer(peerId));
    };
  }, [instanceId, userId, username]);

  // Proactively broadcast local queue when it changes
  useEffect(() => {
    broadcastQueue(localQueue);
  }, [localQueue]);

  return {
    connectedPeers,
    broadcastRoll,
    broadcastActiveItem,
    broadcastEndGiveaway,
    broadcastConsumeProposal,
  };
}
