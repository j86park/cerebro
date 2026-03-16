"use client";

import { useState, useEffect } from "react";

type QueueStatus = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

type GlobalStatus = {
  complianceQueue: QueueStatus;
  onboardingQueue: QueueStatus;
  defaultQueue: QueueStatus;
};

export function useQueueStatus(intervalMs = 3000) {
  const [status, setStatus] = useState<GlobalStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchStatus() {
      try {
        const res = await fetch("/api/agents/status");
        if (!res.ok) throw new Error("Failed to fetch queue status");
        const data = await res.json();
        
        if (mounted) {
          setStatus(data);
          setIsLoading(false);
        }
      } catch (error) {
        console.error(error);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, intervalMs);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [intervalMs]);

  return { status, isLoading };
}
