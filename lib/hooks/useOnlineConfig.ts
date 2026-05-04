// lib/hooks/useOnlineConfig.ts
"use client";

import { useEffect, useState } from "react";
import { fetchOnlineConfig, ONLINE_CONFIG_DEFAULTS, type OnlineConfigResponse } from "@/lib/api/onlineConfig";

export function useOnlineConfig(): {
  config: OnlineConfigResponse;
  isLoading: boolean;
  error: Error | null;
} {
  const [config, setConfig] = useState<OnlineConfigResponse>(ONLINE_CONFIG_DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchOnlineConfig()
      .then((data) => {
        setConfig(data);
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return { config, isLoading, error };
}
