"use client";

import { useEffect, useState } from "react";
import { fetchActivePromos, buildActivePromoLabel, type ActivePromo } from "@/lib/api/promos";

type PromoBannerProps = {
  apiBase?: string | null;
};

export default function PromoBanner({ apiBase }: PromoBannerProps) {
  const [promos, setPromos] = useState<ActivePromo[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetchActivePromos(apiBase, controller.signal)
      .then(setPromos)
      .catch(() => { });
    return () => controller.abort();
  }, [apiBase]);

  if (promos.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-green-600 select-none text-center">
          Promociones
        </p>
        <div className="flex flex-wrap justify-evenly gap-2">
          {promos.map((p) => (
            <span
              key={p.id}
              className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-green-800 ring-1 ring-green-300 shadow-sm"
            >
              {buildActivePromoLabel(p)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
