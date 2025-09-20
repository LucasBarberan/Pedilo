"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import ClosedBanner from "@/components/closed-banner";
import Image from "next/image";
import { fixImageUrl } from "@/lib/img"; // 👈 importar helper

type ApiCombo = {
  id: number | string;
  name: string;
  imageUrl?: string | null;
  effectivePrice?: number | string | null;
  basePrice?: number | string | null;
  description?: string | null;

  // campos flexibles para items del combo
  items?: Array<{
    isMain?: boolean;
    imageUrl?: string | null;
    product?: { imageUrl?: string | null; name?: string | null };
  }>;
  comboItems?: Array<{
    isMain?: boolean;
    imageUrl?: string | null;
    product?: { imageUrl?: string | null; name?: string | null };
  }>;
};

const fmtPrice = (n?: number | string | null) => {
  if (n === null || n === undefined) return "-";
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? `$${(v as number).toLocaleString("es-AR")}` : "-";
};

export default function CombosListPage() {
  const router = useRouter();
  const [combos, setCombos] = useState<ApiCombo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!BASE) return;

    (async () => {
      setLoading(true);
      try {
        // pido items para poder hallar el principal
        const res = await fetch(
          `${BASE}/combo?withEffectivePrice=true&withItems=true`,
          { cache: "no-store" }
        );
        const json = await res.json();
        const list: ApiCombo[] =
          Array.isArray(json?.data) ? json.data :
          Array.isArray(json) ? json : [];
        setCombos(list);
      } catch {
        setCombos([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader showBack onBack={() => router.back()} onCartClick={() => router.push("/carrito")} />
      <div className="h-[6px] w-full bg-white" />
      <ClosedBanner />

      <div className="mx-auto w-full max-w-6xl px-4 pt-3 pb-2">
        <h2 className="text-2xl font-extrabold uppercase">COMBOS</h2>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {loading && <div className="col-span-full p-8 text-center opacity-70">Cargando...</div>}

        {!loading && combos.map((c) => {
          const price = c.effectivePrice ?? c.basePrice ?? null;

          // —— imagen: propia del combo -> principal del combo -> placeholder
          const arr = c.items ?? c.comboItems ?? [];
          const main = arr.find((x: any) => x?.isMain);
          const mainImg = main?.imageUrl || main?.product?.imageUrl || "";
          const imgSrc = fixImageUrl(c.imageUrl || mainImg) || "/placeholder.svg";

          return (
            <div
              key={String(c.id)}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/combos/${c.id}`)}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") && router.push(`/combos/${c.id}`)
              }
              className="rounded-2xl bg-white/60 ring-1 ring-black/5 shadow-sm p-4 flex gap-3 cursor-pointer hover:shadow-md transition"
            >
              <div className="relative h-20 w-24 rounded-lg overflow-hidden flex-shrink-0 bg-neutral-100">
                <Image
                  src={imgSrc}
                  alt={c.name}
                  fill
                  className="object-cover"
                  unoptimized  // en LAN; en prod podés quitarlo
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-extrabold uppercase text-sm sm:text-base break-words">
                  {c.name}
                </div>
                {c.description ? (
                  <div className="text-sm text-muted-foreground line-clamp-2">
                    {c.description}
                  </div>
                ) : null}
                <div className="mt-2 text-lg font-extrabold text-[var(--brand-color)]">
                  {fmtPrice(price)}
                </div>
              </div>
            </div>
          );
        })}

        {!loading && combos.length === 0 && (
          <div className="col-span-full p-8 text-center opacity-70">No hay combos.</div>
        )}
      </div>
    </div>
  );
}
