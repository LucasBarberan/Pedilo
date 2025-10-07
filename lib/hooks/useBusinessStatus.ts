// hooks/useBusinessStatus.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { fetchBusinessStatus, type CombinedStatus } from "@/lib/api/business";

export function useBusinessStatusSmart() {
  const [data, setData] = useState<CombinedStatus | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    try {
      const s = await fetchBusinessStatus();
      setData(s);
      setError(null);
    } catch (e: any) {
      setError(e);
    }
  };

  // primera carga
  useEffect(() => {
    refresh();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  // programar próxima revalidación según nextChange + heartbeat
  useEffect(() => {
    if (!data) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);

    const nextAt = data.web.nextChange?.at ? new Date(data.web.nextChange.at).getTime() : null;
    if (nextAt) {
      const delay = Math.max(nextAt - Date.now() + 500, 5000); // colchón de 0.5s, mínimo 5s
      timeoutRef.current = setTimeout(() => { refresh(); }, delay);
    }

    heartbeatRef.current = setInterval(() => { refresh(); }, 5 * 60_000); // 5 min
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [data?.web.nextChange?.at]);

  return { data, error, isLoading: !data && !error, refresh };
}
