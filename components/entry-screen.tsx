"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, CalendarClock } from "lucide-react";

import SiteHeader from "@/components/site-header";
import HomeScreen from "@/components/home-screen";
import { getTableReservationsMode } from "@/lib/tableReservations";
import type { Category } from "@/lib/categories";

type EntryScreenProps = {
  initialCategories: Category[];
  apiBase?: string | null;
};

/**
 * Landing con dos opciones — "Crear un pedido" (siempre habilitada) y
 * "Reservar mesa" (según NEXT_PUBLIC_TABLE_RESERVATIONS, independiente del
 * modo wholesale). Solo se monta cuando esa env var no está en "off"
 * (ver app/page.tsx).
 */
export default function EntryScreen({ initialCategories, apiBase }: EntryScreenProps) {
  const router = useRouter();
  const [entered, setEntered] = useState(false);
  const reservationsMode = getTableReservationsMode();

  if (entered) {
    return <HomeScreen initialCategories={initialCategories} apiBase={apiBase} />;
  }

  return (
    <div className="bg-background min-h-screen">
      <SiteHeader />
      <div className="mx-auto w-full max-w-md px-4 py-10 flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setEntered(true)}
          className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-6 flex flex-col items-center gap-2 text-center hover:bg-white/80 hover:shadow-md transition"
        >
          <ClipboardList className="w-8 h-8 text-[var(--brand-color)]" />
          <span className="text-lg font-extrabold uppercase">Crear un pedido</span>
        </button>

        {reservationsMode !== "off" && (
          <button
            type="button"
            disabled={reservationsMode === "coming_soon"}
            onClick={() => {
              if (reservationsMode === "on") router.push("/reservar-mesa");
            }}
            className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-6 flex flex-col items-center gap-2 text-center hover:bg-white/80 hover:shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/60 disabled:hover:shadow-none"
          >
            <CalendarClock className="w-8 h-8 text-[var(--brand-color)]" />
            <span className="text-lg font-extrabold uppercase">Reservar mesa</span>
            {reservationsMode === "coming_soon" && (
              <span className="text-xs font-medium text-muted-foreground">Próximamente</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
