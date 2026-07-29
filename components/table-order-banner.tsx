"use client";

import { Armchair, Loader2, LogOut, RefreshCw } from "lucide-react";
import { useTableOrder } from "@/components/table-order-context";

export function TableOrderBanner() {
  const { isTableMode, loading, context, error, refresh, exitTableMode } = useTableOrder();
  if (!isTableMode) return null;

  const available = context?.canOrder === true;
  return (
    <div className={`border-b px-4 py-3 ${available ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`rounded-full p-2 ${available ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Armchair className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-slate-900">
              {context ? `Pedido para ${context.session?.tables.map((table) => table.name).join(" + ") || context.table.name}` : "Validando mesa"}
            </div>
            <div className={`text-xs ${available ? "text-emerald-800" : "text-amber-800"}`}>
              {error || context?.message || "Estamos comprobando el código QR..."}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!available && (
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reintentar
            </button>
          )}
          <button
            type="button"
            onClick={() => void exitTableMode()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-black/5"
          >
            <LogOut className="h-3.5 w-3.5" /> Salir
          </button>
        </div>
      </div>
    </div>
  );
}
