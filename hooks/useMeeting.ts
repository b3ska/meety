"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Meeting } from "@/lib/types";

export interface UseMeetingResult {
  meeting: Meeting | null;
  loading: boolean;
  error: string | null;
  setMeeting: React.Dispatch<React.SetStateAction<Meeting | null>>;
}

export function useMeeting(id: string): UseMeetingResult {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prevent state updates after unmount
  const mountedRef = useRef(true);
  // Track current interval so we never double-start one
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // AbortController for the in-flight fetch
  const abortRef = useRef<AbortController | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchMeeting = useCallback(async () => {
    // Abort any previous in-flight request before starting a new one
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/meetings/${id}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Meeting = await res.json();

      if (!mountedRef.current) return;

      setMeeting(data);
      setError(null);

      // Stop polling once the meeting leaves "processing"
      if (data.status !== "processing") {
        stopPolling();
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      if (!mountedRef.current) return;
      setError((err as Error).message);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [id, stopPolling]);

  // Initial fetch on mount
  useEffect(() => {
    mountedRef.current = true;
    fetchMeeting();

    return () => {
      mountedRef.current = false;
      stopPolling();
      // Abort any in-flight fetch on unmount
      abortRef.current?.abort();
    };
    // fetchMeeting / stopPolling are stable refs — this only re-runs when id changes
  }, [fetchMeeting, stopPolling]);

  // Start polling when status becomes "processing"; stop when it leaves
  useEffect(() => {
    if (meeting?.status === "processing" && intervalRef.current === null) {
      intervalRef.current = setInterval(fetchMeeting, 4000);
    } else if (meeting?.status !== "processing") {
      stopPolling();
    }
    // Intentionally not returning cleanup here; the mount effect handles final cleanup
  }, [meeting?.status, fetchMeeting, stopPolling]);

  return { meeting, loading, error, setMeeting };
}
