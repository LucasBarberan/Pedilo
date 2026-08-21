"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

export type PublicTableContext = {
  table: {
    code: string;
    name: string;
    areaName: string;
    capacity: number;
  };
  state: "DISABLED" | "CLOSED" | "AVAILABLE" | "OPEN" | "BILL_REQUESTED";
  canOrder: boolean;
  message: string;
  /** Solo true con autoservicio activo y sin módulo KITCHEN — condiciona el seguimiento de Pedilo (ver checkout-form.tsx). */
  selfServiceTracking: boolean;
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
  /** Pide la cuenta desde el QR — el cliente no depende de que el personal lo note. */
  requestBill: () => Promise<void>;
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
  const router = useRouter();
  const pathname = usePathname();
  // Solo queremos redirigir a la comanda propia una vez, cuando el cliente
  // recién llega (escaneo del QR / recarga completa) — no en cada refresh
  // periódico, porque si el cliente eligió "Agregar algo más" y volvió al
  // menú manualmente, un refresh 15s después no debe mandarlo de vuelta.
  const checkedOwnCommandRedirect = useRef(false);

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

      if (!checkedOwnCommandRedirect.current) {
        checkedOwnCommandRedirect.current = true;
        const tableCode: string | undefined = body.data?.table?.code;
        // Sin autoservicio (o con KITCHEN activo) el seguimiento no aplica —
        // reabrir el QR siempre vuelve al menú, nunca al seguimiento.
        if (tableCode && body.data?.selfServiceTracking && !pathname?.startsWith("/mesa-seguimiento")) {
          try {
            const trackingToken = localStorage.getItem(`pedilo:table:${tableCode}:trackingToken`);
            if (trackingToken) router.push(`/mesa-seguimiento/${trackingToken}`);
          } catch {
            // localStorage no disponible — simplemente no se ofrece el seguimiento automático
          }
        }
      }
    } catch (refreshError) {
      setContext(null);
      setError(refreshError instanceof Error ? refreshError.message : "No se pudo validar la mesa");
    } finally {
      setLoading(false);
    }
  }, [isTableMode]);

  const requestBill = useCallback(async () => {
    const response = await fetch("/api/table-request-bill", { method: "POST" });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success || !body?.data) {
      throw new Error(body?.error || "No se pudo pedir la cuenta");
    }
    setContext(body.data);
  }, []);

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
    requestBill,
  }), [context, error, exitTableMode, isTableMode, loading, refresh, requestBill]);

  return <TableOrderContext.Provider value={value}>{children}</TableOrderContext.Provider>;
}

export function useTableOrder() {
  const value = useContext(TableOrderContext);
  if (!value) throw new Error("useTableOrder debe usarse dentro de TableOrderProvider");
  return value;
}
