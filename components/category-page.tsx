"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import SiteHeader from "@/components/site-header";
import ClosedBanner from "@/components/closed-banner";
import InfoBanner from "@/components/info-banner";
import BlockingLoader from "@/components/blocking-loader";
import { fixImageUrl } from "@/lib/img";
import type { Category } from "@/lib/categories";
import type { Product } from "@/lib/api/products";
import { fetchProductsByCategory, fetchProductsBySubcategory } from "@/lib/api/products";

type CategoryPageProps = {
  slug: string;
  category: Category | null;
  initialProducts: Product[];
  apiBase: string | null;
};

// Overlay local para no romper tipos si Product no define subcategory/subcategoryId
type ProductWithMaybeSub = Product & {
  subcategory?: { id?: number; name?: string; description?: string | null } | null;
  subcategoryId?: number | null;
};

type SubcategoryDTO = { id: number; name: string; description?: string | null; categoryId?: number };

const fmtPrice = (n?: number | string | null) => {
  if (n === null || n === undefined) return "-";
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? `$${(v as number).toLocaleString("es-AR")}` : "-";
};

export default function CategoryPageClient({
  slug,
  category,
  initialProducts,
  apiBase,
}: CategoryPageProps) {
  const router = useRouter();

  const [products, setProducts] = useState<ProductWithMaybeSub[]>(initialProducts as ProductWithMaybeSub[]);
  const [loading, setLoading] = useState(initialProducts.length === 0 && !!category && !!apiBase);

  useEffect(() => {
    setProducts(initialProducts as ProductWithMaybeSub[]);
  }, [initialProducts]);

  useEffect(() => {
    const shouldFetch = !!category && initialProducts.length === 0 && !!apiBase;
    if (!shouldFetch) return;

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        // 1) Traer productos por categoría (incluye subcategory si tu back lo manda)
        const data = await fetchProductsByCategory(category!.id, {
          baseUrl: apiBase ?? undefined,
          signal: controller.signal,
        });

        if (cancelled) return;

        let finalProducts = data as ProductWithMaybeSub[];

        // 2) Fallback: si no hay productos o no traen subcategoría, intentamos por /subcategories
        const lacksSubInfo =
          finalProducts.length > 0 &&
          !finalProducts.some((p) => p?.subcategory?.id != null || p?.subcategoryId != null);

        if ((finalProducts.length === 0 || lacksSubInfo) && apiBase && category?.id) {
          try {
            const subUrl = new URL(`${apiBase.replace(/\/$/, "")}/subcategories`);
            subUrl.searchParams.set("categoryId", String(category.id));
            const subRes = await fetch(subUrl, { signal: controller.signal });
            if (subRes.ok) {
              const subJson = await subRes.json();
              const subs: SubcategoryDTO[] = Array.isArray(subJson?.data) ? subJson.data : Array.isArray(subJson) ? subJson : [];
              // Si hay subcategorías, traemos productos por cada una
              if (subs.length > 0) {
                const perSub = await Promise.all(
                  subs.map(async (sc) => {
                    const prods = await fetchProductsBySubcategory(sc.id, {
                      baseUrl: apiBase,
                      signal: controller.signal,
                    });

                    const ensuredCategoryId = (sc.categoryId != null ? sc.categoryId : Number(category?.id)) || undefined;

                    return (prods as ProductWithMaybeSub[]).map((p) => ({
                      ...p,
                      subcategory: p.subcategory ?? {
                        id: sc.id,
                        name: sc.name,
                        categoryId: ensuredCategoryId as number,
                        description: sc.description ?? null,
                      },
                      subcategoryId: p.subcategoryId ?? sc.id,
                    }));
                  })
                );
                finalProducts = perSub.flat();

                // si aún así no vino nada, mantenemos lo que teníamos (data)
                if (finalProducts.length === 0) finalProducts = data as ProductWithMaybeSub[];
              }
            }
          } catch {
            // ignoramos el error del fallback; nos quedamos con data
          }
        }

        setProducts(finalProducts);
      } catch {
        if (!cancelled) {
          setProducts([]);
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

  // Agrupar por subcategoría si existe; si no, grupo plano
  const groups = useMemo(() => {
    const list = products;

    const anySub = list.some((p) => p?.subcategory?.id != null || p?.subcategoryId != null);
    if (!anySub) {
      return [
        {
          key: "no-subcat",
          header: null as null | { title: string; description?: string | null },
          items: list,
        },
      ];
    }

    type G = {
      key: string | number;
      header: { title: string; description?: string | null };
      items: ProductWithMaybeSub[];
    };
    const map = new Map<string | number, G>();

    for (const p of list) {
      const sid = (p.subcategory?.id ?? p.subcategoryId) as number | undefined;
      const sname = p.subcategory?.name ?? "Subcategoría";
      const sdesc = p.subcategory?.description ?? null;
      const key = sid ?? -1;

      if (!map.has(key)) {
        map.set(key, {
          key,
          header: key === -1 ? { title: "Otros", description: undefined } : { title: String(sname), description: sdesc ?? undefined },
          items: [],
        });
      }
      map.get(key)!.items.push(p);
    }

    // Orden simple por título asc
    return Array.from(map.values()).sort((a, b) =>
      String(a.header.title).localeCompare(String(b.header.title), "es")
    );
  }, [products]);

  const handleCartClick = () => router.push("/carrito");

  return (
    <div className="bg-background">
      <SiteHeader
        showBack
        onBack={() => router.back()}
        onCartClick={handleCartClick}
      />
      <div className="h-[6px] w-full bg-white" />
      <ClosedBanner />
      <InfoBanner />

      <div className="mx-auto w-full max-w-6xl px-4 pt-3 pb-2">
        <h2 className="text-2xl font-extrabold uppercase">{title}</h2>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <BlockingLoader open={loading} message="Preparando la carta..." />

        {/* Render por grupos (mismo estilo de cards) */}
        {!loading &&
          groups.map((group) => (
            <div key={String(group.key)} className="col-span-full">
              {group.header && (
                <div className="mb-3">
                  <h3 className="text-base font-extrabold uppercase">
                    {group.header.title}
                  </h3>
                  {group.header.description && (
                    <p className="text-sm text-muted-foreground">
                      {group.header.description}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {group.items.map((p) => {
                  const showPromo = !!p.promoLabel && p.basePrice != null && p.price != null && p.price !== p.basePrice;
                  const unit = typeof p.price === "number" ? p.price : undefined;
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
                          src={fixImageUrl((p as any).imageUrl) || "/placeholder.svg"}
                          alt={String((p as any).name)}
                          fill
                          className="object-cover"
                        />
                        {p.promoLabel && (
                          <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-green-500 text-white rounded px-1.5 py-0.5 leading-none shadow-sm">
                            {p.promoLabel}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-extrabold uppercase text-sm sm:text-base break-words">
                          {(p as any).name}
                        </div>
                        <div className="text-sm text-muted-foreground line-clamp-2">
                          {(p as any).description || ""}
                        </div>

                        {!showPromo ? (
                          <div className="mt-2 text-lg font-extrabold text-[var(--brand-color)]">
                            {fmtPrice(unit)}
                          </div>
                        ) : (
                          <div className="mt-2">
                            <div className="text-sm text-muted-foreground line-through">
                              {fmtPrice(p.basePrice)}
                            </div>
                            <div className="text-lg font-extrabold text-[var(--brand-color)]">
                              {fmtPrice(unit)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

        {!loading && products.length === 0 && (
          <div className="col-span-full p-8 text-center opacity-70">
            No hay productos en esta categoria.
          </div>
        )}
      </div>
    </div>
  );
}
