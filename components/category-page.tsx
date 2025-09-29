"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import SiteHeader from "@/components/site-header";
import ClosedBanner from "@/components/closed-banner";
import BlockingLoader from "@/components/blocking-loader";
import { fixImageUrl } from "@/lib/img";
import type { Category } from "@/lib/categories";
import type { Product } from "@/lib/api/products";
import { fetchProductsByCategory } from "@/lib/api/products";
import { quoteProductsBatch, type QuoteProductsBatchMap } from "@/lib/pricing";

type CategoryPageProps = {
  slug: string;
  category: Category | null;
  initialProducts: Product[];
  initialPromoMap: QuoteProductsBatchMap;
  apiBase: string | null;
};

const fmtPrice = (n?: number | string | null) => {
  if (n === null || n === undefined) return "-";
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? `$${(v as number).toLocaleString("es-AR")}` : "-";
};

export default function CategoryPageClient({
  slug,
  category,
  initialProducts,
  initialPromoMap,
  apiBase,
}: CategoryPageProps) {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [promoMap, setPromoMap] = useState<QuoteProductsBatchMap>(initialPromoMap);
  const [loading, setLoading] = useState(initialProducts.length === 0 && !!category && !!apiBase);

  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  useEffect(() => {
    setPromoMap(initialPromoMap);
  }, [initialPromoMap]);

  useEffect(() => {
    const shouldFetch = !!category && initialProducts.length === 0 && !!apiBase;
    if (!shouldFetch) return;

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const data = await fetchProductsByCategory(category.id, {
          baseUrl: apiBase ?? undefined,
          signal: controller.signal,
        });
        if (cancelled) return;
        setProducts(data);

        const ids = data
          .map((p) => Number(p.id))
          .filter((n) => Number.isFinite(n)) as number[];

        if (ids.length === 0) {
          setPromoMap({});
          return;
        }

        const quoted = await quoteProductsBatch(ids, {
          baseUrl: apiBase ?? undefined,
          signal: controller.signal,
        });
        if (!cancelled) setPromoMap(quoted);
      } catch {
        if (!cancelled) {
          setProducts([]);
          setPromoMap({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [category, initialProducts.length, apiBase]);

  const title = useMemo(() => {
    if (category?.name) return category.name.toUpperCase();
    if (slug) return String(slug).replace(/-/g, " ").toUpperCase();
    return "CATEGORIA";
  }, [category, slug]);

  const handleCartClick = () => router.push("/carrito");

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader
        showBack
        onBack={() => router.back()}
        onCartClick={handleCartClick}
      />
      <div className="h-[6px] w-full bg-white" />
      <ClosedBanner />

      <div className="mx-auto w-full max-w-6xl px-4 pt-3 pb-2">
        <h2 className="text-2xl font-extrabold uppercase">{title}</h2>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <BlockingLoader open={loading} message="Preparando la carta..." />

        {!loading &&
          products.map((p) => {
            const productId = Number(p.id);
            const promo = Number.isFinite(productId) ? promoMap[productId] : undefined;
            const showPromo = promo?.hasPromo && Number.isFinite(promo.unit);
            const unit = promo?.unit ?? (typeof p.price === "number" ? p.price : undefined);
            const targetUrl = `/producto/${p.id}`;

            return (
              <div
                key={String(p.id)}
                onClick={() => router.push(targetUrl)}
                onMouseEnter={() => router.prefetch(targetUrl)}
                onTouchStart={() => router.prefetch(targetUrl)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") router.push(targetUrl);
                }}
                role="button"
                tabIndex={0}
                className="rounded-2xl bg-white/60 ring-1 ring-black/5 shadow-sm p-4 flex gap-3 cursor-pointer hover:shadow-md transition"
              >
                <div className="relative h-20 w-24 rounded-lg overflow-hidden flex-shrink-0">
                  <Image
                    src={fixImageUrl(p.imageUrl) || "/placeholder.svg"}
                    alt={p.name}
                    fill
                    className="object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-extrabold uppercase text-sm sm:text-base break-words">
                    {p.name}
                  </div>
                  <div className="text-sm text-muted-foreground line-clamp-2">
                    {p.description || ""}
                  </div>

                  {!showPromo ? (
                    <div className="mt-2 text-lg font-extrabold text-[var(--brand-color)]">
                      {fmtPrice(unit)}
                    </div>
                  ) : (
                    <div className="mt-2">
                      <div className="text-sm text-muted-foreground line-through">
                        {fmtPrice(promo.list)}
                      </div>
                      <div className="text-lg font-extrabold text-[var(--brand-color)]">
                        {fmtPrice(promo.unit)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

        {!loading && products.length === 0 && (
          <div className="col-span-full p-8 text-center opacity-70">
            No hay productos en esta categoria.
          </div>
        )}
      </div>
    </div>
  );
}
