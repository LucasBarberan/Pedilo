"use client";

import { Armchair, Loader2, LogOut, RefreshCw } from "lucide-react";
import { useTableOrder } from "@/components/table-order-context";

export function TableOrderBanner() {
  const { isTableMode, loading, context, error, refresh, exitTableMode } = useTableOrder();

  if (!isTableMode) return null;

  const available = context?.canOrder === true;
  const messageText = error || context?.message || (!context ? "Estamos comprobando el código QR..." : "");

  return (
    <div className={`relative border-b px-4 py-2 ${available ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="mx-auto w-full max-w-6xl pr-16">
        <div className="flex items-center gap-2">
          <div className={`shrink-0 rounded-full p-1.5 ${available ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Armchair className="h-4 w-4" />}
          </div>
          <div className="min-w-0 truncate text-sm font-bold text-slate-900">
            {context ? `Pedido ${context.session?.tables.map((table) => table.name).join(" + ") || context.table.name}` : "Validando mesa"}
          </div>
        </div>
        {messageText && (
          <div className={`mt-0.5 text-xs ${available ? "text-emerald-800" : "text-amber-800"}`}>
            {messageText}
          </div>
        )}
        {!available && (
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:underline"
          >
            <RefreshCw className="h-3 w-3" /> Reintentar
          </button>
        )}
      </div>
      <button
        type="button"
        title="Salir de la mesa"
        onClick={() => void exitTableMode()}
        className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-black/5"
      >
        <LogOut className="h-3.5 w-3.5" /> Salir
      </button>
    </div>
  );
}
