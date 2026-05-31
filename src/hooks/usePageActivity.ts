"use client";

import { useEffect, useState, useRef } from "react";

interface PageActivityOptions {
  idleTimeoutMs?: number;
}

export function usePageActivity({ idleTimeoutMs = 120000 }: PageActivityOptions = {}) {
  const [isActive, setIsActive] = useState(true);
  const [isTabVisible, setIsTabVisible] = useState(true);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    // Sync initial visibility state
    setIsTabVisible(document.visibilityState === "visible");

    const resetIdleTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setIsActive(false);
      }, idleTimeoutMs);
    };

    const handleActivity = () => {
      const now = Date.now();
      // Throttle activity processing to avoid excessive re-renders during rapid movements (e.g. mousemoves)
      if (now - lastActivityTimeRef.current > 1500 || !isActive) {
        setIsActive(true);
        lastActivityTimeRef.current = now;
      }
      resetIdleTimer();
    };

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      setIsTabVisible(visible);
      if (visible) {
        setIsActive(true);
        resetIdleTimer();
      } else {
        setIsActive(false);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      }
    };

    // Set up activity event listeners
    const activityEvents = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Set up visibility listener
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Initialize the timer
    resetIdleTimer();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [idleTimeoutMs, isActive]);

  return {
    isActive: isActive && isTabVisible,
    isTabVisible,
  };
}
