"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PublicTableContext = {
  table: {
    code: string;
    name: string;
    areaName: string;
  };
  state: "DISABLED" | "AVAILABLE" | "OPEN" | "BILL_REQUESTED";
  canOrder: boolean;
  message: string;
  session: {
    status: string;
    openedAt: string;
    tables: Array<{ code: string; name: string }>;
  } | null;
};

type TableOrderContextValue = {
  isTableMode: boolean;
  loading: boolean;
  context: PublicTableContext | null;
  error: string | null;
  refresh: () => Promise<void>;
  exitTableMode: () => Promise<void>;
};

const TableOrderContext = createContext<TableOrderContextValue | null>(null);

export function TableOrderProvider({
  initialActive,
  children,
}: {
  initialActive: boolean;
  children: ReactNode;
}) {
  const [isTableMode, setIsTableMode] = useState(initialActive);
  const [loading, setLoading] = useState(initialActive);
  const [context, setContext] = useState<PublicTableContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isTableMode) return;
    setLoading(true);
    try {
      const response = await fetch("/api/table-context", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success || !body?.data) {
        throw new Error(body?.error || "No se pudo validar la mesa");
      }
      setContext(body.data);
      setError(null);
    } catch (refreshError) {
      setContext(null);
      setError(refreshError instanceof Error ? refreshError.message : "No se pudo validar la mesa");
    } finally {
      setLoading(false);
    }
  }, [isTableMode]);

  const exitTableMode = useCallback(async () => {
    await fetch("/api/table-context", { method: "DELETE" }).catch(() => undefined);
    setIsTableMode(false);
    setContext(null);
    setError(null);
    setLoading(false);
    window.location.href = "/";
  }, []);

  useEffect(() => {
    if (!isTableMode) return;
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [isTableMode, refresh]);

  const value = useMemo<TableOrderContextValue>(() => ({
    isTableMode,
    loading,
    context,
    error,
    refresh,
    exitTableMode,
  }), [context, error, exitTableMode, isTableMode, loading, refresh]);

  return <TableOrderContext.Provider value={value}>{children}</TableOrderContext.Provider>;
}

export function useTableOrder() {
  const value = useContext(TableOrderContext);
  if (!value) throw new Error("useTableOrder debe usarse dentro de TableOrderProvider");
  return value;
}
