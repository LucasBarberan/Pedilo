"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import SiteHeader from "@/components/site-header";
import ClosedBanner from "@/components/closed-banner";
import InfoBanner from "@/components/info-banner";
import BlockingLoader from "@/components/blocking-loader";
import { fixImageUrl } from "@/lib/img";
import { isAllowedForDelivery } from "@/lib/channel";
import { fetchCombos, type Combo } from "@/lib/api/combos";
import PromoBanner from "./promo-banner";

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
};

const fmtPrice = (n?: number | string | null) => {
  const v = toNum(n);
  return v === null ? "-" : `$${v.toLocaleString("es-AR")}`;
};

type CombosListScreenProps = {
  initialCombos: Combo[];
  categoryName: string | null;
  categoryId?: string | null;
  apiBase: string | null;
};

export default function CombosListScreen({ initialCombos, categoryName, categoryId, apiBase }: CombosListScreenProps) {
  const router = useRouter();

  const [combos, setCombos] = useState<Combo[]>(initialCombos);
  const [loading, setLoading] = useState(initialCombos.length === 0 && !!apiBase);
  const [titleOverride, setTitleOverride] = useState<string | null>(categoryName);

  useEffect(() => {
    setCombos(initialCombos);
  }, [initialCombos]);

  useEffect(() => {
    setTitleOverride(categoryName);
  }, [categoryName]);

  useEffect(() => {
    const shouldFetchOnClient = initialCombos.length === 0 && !!apiBase;
    if (!shouldFetchOnClient) return;

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const data = await fetchCombos({
          baseUrl: apiBase ?? undefined,
          signal: controller.signal,
          categoryId: categoryId ?? undefined,
          withItems: true,
          withEffectivePrice: true,
          onlyActive: true,
          onlyDeliveryAllowed: true,
          onlyComboCategory: true,
        });
        if (!cancelled) {
          setCombos(data);
          if (!categoryName && data.length > 0) {
            const first = data[0];
            setTitleOverride(first.categoryName ?? first.category?.name ?? null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) {
        setLoading(false);
        setCombos([]);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [initialCombos.length, apiBase, categoryId, categoryName]);


  const title = useMemo(() => {
    if (titleOverride) return titleOverride.toUpperCase();
    return "COMBOS";
  }, [titleOverride]);

  const buildMainImage = (combo: Combo) => {
    const main = combo.items?.find((item) => item?.isMain);
    const arr = combo.items ?? [];
    const fallback = arr.find((item) => item?.isMain) ?? arr[0];
    const mainImg =
      (combo.imageUrl && combo.imageUrl.trim ? combo.imageUrl.trim() : combo.imageUrl) ||
      (main?.product?.imageUrl ?? fallback?.product?.imageUrl ?? "");
    return fixImageUrl(mainImg || undefined) || "/placeholder.svg";
  };

  const prewarmCombo = (combo: Combo) => {
    try {
      sessionStorage.setItem(
        `prefetch:combo:${combo.id}`,
        JSON.stringify({
          id: combo.id,
          name: combo.name,
          description: combo.description ?? "",
          imageUrl: buildMainImage(combo),
          basePrice: combo.basePrice ?? null,
          effectivePrice: combo.effectivePrice ?? null,
        })
      );
    } catch {
      // ignore storage errors
    }

    const src = buildMainImage(combo);
    if (src && typeof window !== "undefined" && typeof Image !== "undefined") {
      const img = new window.Image();
      img.src = src;
    }
  };

  const navigateToCombo = (combo: Combo) => {
    const url = `/combos/${encodeURIComponent(String(combo.id))}`;
    prewarmCombo(combo);
    router.prefetch(url);
    router.push(url);
  };

  return (
    <div className="bg-background">
      <SiteHeader showBack onBack={() => router.back()} onCartClick={() => router.push("/carrito")} />
      <ClosedBanner />
      <InfoBanner />
      <PromoBanner apiBase={apiBase} />
      <div className="mx-auto w-full max-w-6xl px-4 pt-3 pb-2">
        <h2 className="text-2xl font-extrabold uppercase">{title}</h2>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-4 pb-28 grid grid-cols-1 gap-4 md:grid-cols-2">
        {!loading &&
          combos
            .filter((combo) => {
              if (!isAllowedForDelivery(combo.channel)) return false;
              if (combo.active === false) return false;
              if (combo.category?.isComboCategory !== true) return false;
              if (categoryId) {
                const current = combo.categoryId ?? combo.category?.id;
                return String(current ?? "") === String(categoryId);
              }
              return true;
            })
            .map((combo) => {
              const base = toNum(combo.basePrice);
              const eff = toNum(combo.effectivePrice);
              const showDiscount = !!combo.promoLabel && base !== null && eff !== null && eff < base;
              const imgSrc = buildMainImage(combo);

              return (
                <div
                  key={String(combo.id)}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigateToCombo(combo)}
                  onMouseEnter={() => prewarmCombo(combo)}
                  onTouchStart={() => prewarmCombo(combo)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && navigateToCombo(combo)}
                  className="rounded-2xl bg-white/60 ring-1 ring-black/5 shadow-sm p-4 flex gap-3 cursor-pointer hover:shadow-md transition"
                >
                  <div className="relative h-20 w-24 rounded-lg overflow-hidden flex-shrink-0 bg-neutral-100">
                    <Image src={imgSrc} alt={combo.name} fill className="object-cover" unoptimized />
                    {combo.promoLabel && (
                      <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold bg-green-500 text-white rounded-full px-2 py-0.5 leading-none shadow">
                        {combo.promoLabel}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold uppercase text-sm sm:text-base break-words">
                      {combo.name}
                    </div>

                    {combo.description ? (
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {combo.description}
                      </div>
                    ) : null}

                    <div className="mt-2 flex items-baseline gap-2">
                      {showDiscount && (
                        <span className="text-sm text-muted-foreground line-through">
                          {fmtPrice(base)}
                        </span>
                      )}
                      <span className="text-lg font-extrabold text-[var(--brand-color)]">
                        {fmtPrice(showDiscount ? eff : (eff ?? base))}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

        <BlockingLoader open={loading} message="Preparando la carta..." />
      </div>
    </div>
  );
}
