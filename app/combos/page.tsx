"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import ClosedBanner from "@/components/closed-banner";
import Image from "next/image";
import { fixImageUrl } from "@/lib/img";
import BlockingLoader from "@/components/blocking-loader";
import { isAllowedForDelivery } from "@/lib/channel";

type ApiCombo = {
  id: number | string;
  name: string;
  code?: string | number;
  description?: string | null;
  imageUrl?: string | null;
  basePrice?: number | string | null;
  effectivePrice?: number | string | null;
  active?: boolean;
  channel?: string;
  categoryId?: number | string;
  category?: {
    id: number | string;
    name: string;
    isComboCategory?: boolean;
  };
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
  const searchParams = useSearchParams();
  const [combos, setCombos] = useState<ApiCombo[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryName, setCategoryName] = useState<string | null>(null);

  useEffect(() => {
    const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!BASE) return;

    (async () => {
      setLoading(true);
      try {
        const categoryId = searchParams.get("categoryId");

        const qs = new URLSearchParams();
        qs.set("withEffectivePrice", "true");
        qs.set("withItems", "true");
        if (categoryId) qs.set("category", categoryId);

        const res = await fetch(`${BASE}/combo?${qs.toString()}`, { cache: "no-store" });
        const json = await res.json();
        const list: ApiCombo[] = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);

        // Filtrado client-side
        const filtered = list.filter((c) => {
          const isComboCat = c?.category?.isComboCategory === true;
          if (!isComboCat) return false;
          if (!isAllowedForDelivery((c as any).channel)) return false;
          if (!categoryId) return true;
          return String(c.categoryId ?? c.category?.id) === String(categoryId);
        });

        setCombos(filtered);

        // Título de categoría si vino categoryId
        if (categoryId) {
          const byCombo = filtered[0]?.category?.name;
          if (byCombo) {
            setCategoryName(byCombo);
          } else {
            try {
              const catsRes = await fetch(`${BASE}/categories`, { cache: "no-store" });
              const catsJson = await catsRes.json();
              const cats: any[] = Array.isArray(catsJson?.data)
                ? catsJson.data
                : (Array.isArray(catsJson) ? catsJson : []);
              const found = cats.find((c) => String(c.id) === String(categoryId));
              setCategoryName(found?.name ?? null);
            } catch {
              setCategoryName(null);
            }
          }
        } else {
          setCategoryName(null);
        }
      } catch {
        setCombos([]);
        setCategoryName(null);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const title = useMemo(() => {
    if (categoryName) return `${String(categoryName).toUpperCase()}`;
    return "COMBOS";
  }, [categoryName]);

  // ---------- Prefetch helpers ----------
  const buildMainImage = (c: ApiCombo) => {
    const arr = c.items ?? c.comboItems ?? [];
    const main = arr.find((x: any) => x?.isMain);
    const mainImg = main?.imageUrl || main?.product?.imageUrl || "";
    return fixImageUrl(c.imageUrl || mainImg) || "/placeholder.svg";
  };

  const prewarmCombo = (c: ApiCombo) => {
    try {
      sessionStorage.setItem(
        `prefetch:combo:${c.id}`,
        JSON.stringify({
          id: c.id,
          name: c.name,
          description: c.description ?? "",
          imageUrl: buildMainImage(c),
          basePrice: c.basePrice ?? null,
          effectivePrice: c.effectivePrice ?? null,
          // Si necesitás algo del main para render inicial:
          // mainName: (c.items ?? c.comboItems ?? []).find(i => i?.isMain)?.product?.name ?? null,
        })
      );
    } catch {}

    const src = buildMainImage(c);
    if (src && typeof Image !== "undefined") {
      const img = new window.Image();
      img.src = src;
    }
  };

  const prefetchAndGo = (c: ApiCombo) => {
    const url = `/combos/${encodeURIComponent(String(c.id))}`;
    prewarmCombo(c);
    router.prefetch(url);
    router.push(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader showBack onBack={() => router.back()} onCartClick={() => router.push("/carrito")} />
      <div className="h-[6px] w-full bg-white" />
      <ClosedBanner />

      <div className="mx-auto w-full max-w-6xl px-4 pt-3 pb-2">
        <h2 className="text-2xl font-extrabold uppercase">{title}</h2>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {!loading &&
          combos.map((c) => {
            const price = c.effectivePrice ?? c.basePrice ?? null;
            const imgSrc = buildMainImage(c);

            return (
              <div
                key={String(c.id)}
                role="button"
                tabIndex={0}
                onClick={() => prefetchAndGo(c)}
                onMouseEnter={() => prewarmCombo(c)}
                onTouchStart={() => prewarmCombo(c)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && prefetchAndGo(c)}
                className="rounded-2xl bg-white/60 ring-1 ring-black/5 shadow-sm p-4 flex gap-3 cursor-pointer hover:shadow-md transition"
              >
                <div className="relative h-20 w-24 rounded-lg overflow-hidden flex-shrink-0 bg-neutral-100">
                  <Image
                    src={imgSrc}
                    alt={c.name}
                    fill
                    className="object-cover"
                    unoptimized
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

        {/* Overlay bloqueante mientras carga */}
        <BlockingLoader open={loading} message="Preparando la carta…" />
      </div>
    </div>
  );
}
