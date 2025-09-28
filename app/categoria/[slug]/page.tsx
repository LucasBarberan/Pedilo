"use client";

import SiteHeader from "@/components/site-header";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ClosedBanner from "@/components/closed-banner";
import { fixImageUrl } from "@/lib/img";
import BlockingLoader from "@/components/blocking-loader";

type Product = {
  id: string | number;
  name: string;
  description?: string;
  price?: number | string;
  imageUrl?: string;
  categoryId?: string | number;
  code?: string | number;
  isActive?: boolean;
};

type Category = {
  id: string | number;
  code?: string | number;
  name: string;
};

const fmtPrice = (n?: number | string | null) => {
  if (n === null || n === undefined) return "-";
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? `$${(v as number).toLocaleString("es-AR")}` : "-";
};

const slugify = (s: string) =>
  s.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

/* ====== Cotización batch de productos (qty: 1, sin opciones) ====== */
type QuoteItemProductView = {
  kind: "PRODUCT";
  productId: number;
  unitList: string;   // lista sin promo
  unitPrice: string;  // unitario efectivo (con promo/ponderación)
  promo?: { type: string; value: string; units: number; applyToOptions: boolean };
};

async function quoteProductsBatch(ids: number[]) {
  const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!BASE || !ids.length) return {} as Record<number, { unit: number; list: number | null; hasPromo: boolean }>;

  const body = {
    channel: "WEB",
    lines: ids.map((pid) => ({
      type: "PRODUCT",
      product_id: pid,
      quantity: 1,
      option_ids: [],
    })),
  };

  try {
    const res = await fetch(`${BASE}/pricing/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    if (!res.ok) return {};

    const json = await res.json();
    const items: QuoteItemProductView[] = Array.isArray(json?.items)
      ? json.items.filter((i: any) => i.kind === "PRODUCT")
      : [];

    const map: Record<number, { unit: number; list: number | null; hasPromo: boolean }> = {};
    for (const it of items) {
      const unit = Number(it.unitPrice);
      const list = Number(it.unitList);
      const okU = Number.isFinite(unit);
      const okL = Number.isFinite(list);
      map[it.productId] = {
        unit: okU ? unit : NaN,
        list: okL ? list : null,
        hasPromo: !!it.promo && okU && okL && unit < list,
      };
    }
    return map;
  } catch {
    return {};
  }
}

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [category, setCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // precios cotizados por id
  const [promoMap, setPromoMap] = useState<Record<number, { unit: number; list: number | null; hasPromo: boolean }>>({});

  useEffect(() => {
    const BASE = process.env.NEXT_PUBLIC_API_URL;
    if (!slug || !BASE) return;

    (async () => {
      setLoading(true);

      // redirección a /combos si corresponde
      const isCombos = String(slug).toLowerCase() === "combos";
      if (isCombos) {
        router.replace("/combos");
        return;
      }

      try {
        // categorías
        const catsRes = await fetch(`${BASE}/categories`, { cache: "no-store" });
        const catsJson = await catsRes.json();
        const cats: Category[] = Array.isArray(catsJson)
          ? catsJson
          : Array.isArray(catsJson?.data)
            ? catsJson.data
            : Array.isArray(catsJson?.data?.data)
              ? catsJson.data.data
              : [];

        const cat =
          cats.find((c) => slugify(c.name) === slug) ||
          cats.find((c) => String(c.code) === String(slug));

        setCategory(cat ?? null);

        // productos por categoría
        if (cat) {
          const res = await fetch(
            `${BASE}/products?category=${encodeURIComponent(String(cat.id))}&page=1&limit=50`,
            { cache: "no-store" }
          );
          const json = await res.json();
          const prodsRaw: any[] = Array.isArray(json)
            ? json
            : Array.isArray(json?.data)
              ? json.data
              : Array.isArray(json?.data?.data)
                ? json.data.data
                : [];

          // normalizar + FILTRAR isActive
          const prods: Product[] = prodsRaw
            .filter((p) => p?.isActive !== false) // solo activos
            .map((p) => {
              const raw = p.price ?? p.basePrice ?? p.finalPrice ?? p.unitPrice;
              const price =
                typeof raw === "string" ? Number(raw) :
                typeof raw === "number" ? raw : undefined;
              return { ...p, price };
            });

          setProducts(prods);

          // ===== Cotización batch para promos (qty 1) =====
          const ids = prods.map((p) => Number(p.id)).filter((n) => Number.isFinite(n));
          const quoted = await quoteProductsBatch(ids);
          setPromoMap(quoted);
        } else {
          setProducts([]);
          setPromoMap({});
        }
      } catch {
        setCategory(null);
        setProducts([]);
        setPromoMap({});
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, router]);

  const title = useMemo(() => {
    if (category?.name) return category.name.toUpperCase();
    if (slug) return String(slug).replace(/-/g, " ").toUpperCase();
    return "CATEGORÍA";
  }, [category, slug]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader
        showBack
        onBack={() => router.back()}
        onCartClick={() => router.push("/carrito")}
      />
      <div className="h-[6px] w-full bg-white" />
      <ClosedBanner />

      <div className="mx-auto w-full max-w-6xl px-4 pt-3 pb-2">
        <h2 className="text-2xl font-extrabold uppercase">{title}</h2>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <BlockingLoader open={loading} message="Preparando la carta…" />

        {!loading &&
          products.map((p) => {
            const q = promoMap[Number(p.id)];
            const showPromo = q?.hasPromo && Number.isFinite(q.unit);
            const unit = q?.unit ?? (typeof p.price === "number" ? p.price : undefined);

            return (
              <div
                key={String(p.id)}
                onClick={() => router.push(`/producto/${p.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") router.push(`/producto/${p.id}`);
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

                  {/* Precio con promo (si aplica) */}
                  {!showPromo ? (
                    <div className="mt-2 text-lg font-extrabold text-[var(--brand-color)]">
                      {fmtPrice(unit)}
                    </div>
                  ) : (
                    <div className="mt-2">
                      <div className="text-sm text-muted-foreground line-through">
                        {fmtPrice(q.list)}
                      </div>
                      <div className="text-lg font-extrabold text-[var(--brand-color)]">
                        {fmtPrice(q.unit)}
                      </div>
                      {/* opcional: badge */}
                      {/* <div className="text-[11px] text-green-700 font-medium">Promo</div> */}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

        {!loading && products.length === 0 && (
          <div className="col-span-full p-8 text-center opacity-70">
            No hay productos en esta categoría.
          </div>
        )}
      </div>
    </div>
  );
}
