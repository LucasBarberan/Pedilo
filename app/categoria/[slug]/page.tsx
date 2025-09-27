"use client";

import SiteHeader from "@/components/site-header";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ClosedBanner from "@/components/closed-banner";
import { fixImageUrl } from "@/lib/img";
import BlockingLoader from "@/components/blocking-loader";

// ===== Tipos =====
type Product = {
  id: string | number;
  name: string;
  description?: string;
  price?: number | string;
  imageUrl?: string;
  categoryId?: string | number;
  code?: string | number;
};

type Category = {
  id: string | number;
  code?: string | number;
  name: string;
};

// reemplazá tu fmtPrice por éste
const fmtPrice = (n?: number | string) => {
  const v =
    typeof n === "string" ? Number(n) :
    typeof n === "number" ? n : undefined;
  return typeof v === "number" && Number.isFinite(v)
    ? `$${v.toLocaleString("es-AR")}`
    : "-";
};

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

// ===== Helpers de prefetch/prewarm =====
function prewarmProduct(p: any) {
  try {
    sessionStorage.setItem(
      `prefetch:product:${p.id}`,
      JSON.stringify({
        id: p.id,
        name: p.name,
        imageUrl: p.imageUrl ?? "",
        price: typeof p.price === "string" ? Number(p.price) : (p.price ?? 0),
        description: p.description ?? "",
        code: p.code ?? "",
      })
    );
  } catch {}

  const src = fixImageUrl(p.imageUrl); // 👈 acá
  if (src && typeof Image !== "undefined") {
    const img = new window.Image();
    img.src = src;
  }
}

function buildDetailUrl(p: any, category?: Category | null) {
  const isCombo =
    category?.code === "COMBOS" ||
    category?.id === "combos" ||
    p.code === "COMBO";
  return isCombo
    ? `/combos/${encodeURIComponent(String(p.id))}`
    : `/producto/${encodeURIComponent(String(p.id))}`;
}

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [category, setCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const BASE = process.env.NEXT_PUBLIC_API_URL;
    if (!slug || !BASE) return;

    (async () => {
      setLoading(true);

      const isCombos = String(slug).toLowerCase() === "combos";
      if (isCombos) {
        router.replace("/combos");
        return; // cortamos el efecto
      }

      try {
        // --- CATEGORÍAS (extrae array desde json.data o json.data.data) ---
        const catsRes = await fetch(`${BASE}/categories`, { cache: "no-store" });
        const catsJson = await catsRes.json();
        const cats: Category[] =
          Array.isArray(catsJson)
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

        // --- PRODUCTOS por categoría (usa ?category=<id>) ---
        if (cat) {
          const res = await fetch(
            `${BASE}/products?category=${encodeURIComponent(String(cat.id))}&page=1&limit=50`,
            { cache: "no-store" }
          );
          const json = await res.json();
          const prodsRaw: any[] =
            Array.isArray(json)
              ? json
              : Array.isArray(json?.data)
              ? json.data
              : Array.isArray(json?.data?.data)
              ? json.data.data
              : [];

          const prods: Product[] = prodsRaw.map((p) => {
            const raw = p.price ?? p.basePrice ?? p.finalPrice ?? p.unitPrice;
            const price =
              typeof raw === "string" ? Number(raw) :
              typeof raw === "number" ? raw : undefined;
            return { ...p, price };
          });

          setProducts(prods);
        } else {
          setProducts([]);
        }
      } catch {
        setCategory(null);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    })().catch(() => {
      setCategory(null);
      setProducts([]);
      setLoading(false);
    });
  }, [slug, router]);

  const title = useMemo(() => {
    if (category?.name) return category.name.toUpperCase();
    if (slug) return String(slug).replace(/-/g, " ").toUpperCase();
    return "CATEGORÍA";
  }, [category, slug]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header con back y carrito */}
      <SiteHeader
        showBack
        onBack={() => router.back()}
        onCartClick={() => router.push("/carrito")}
      />
      <div className="h-[6px] w-full bg-white" />

      {/* Banner “local cerrado” */}
      <ClosedBanner />

      {/* Título */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-3 pb-2">
        <h2 className="text-2xl font-extrabold uppercase">{title}</h2>
      </div>

      {/* Lista */}
      <div className="mx-auto w-full max-w-6xl px-4 py-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Overlay bloqueante mientras carga */}
        <BlockingLoader open={loading} message="Preparando la carta…" />

        {!loading &&
          products.map((p) => {
            const url = buildDetailUrl(p, category);
            return (
              <div
                key={String(p.id)}
                onMouseEnter={() => {
                  prewarmProduct(p);
                  router.prefetch(url);
                }}
                onTouchStart={() => {
                  prewarmProduct(p);
                  router.prefetch(url);
                }}
                onClick={() => {
                  prewarmProduct(p);
                  router.prefetch(url);
                  router.push(url);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    prewarmProduct(p);
                    router.prefetch(url);
                    router.push(url);
                  }
                }}
                className="rounded-2xl bg-white/60 ring-1 ring-black/5 shadow-sm p-4 flex gap-3 cursor-pointer hover:shadow-md transition"
                role="button"
                tabIndex={0}
              >
                <div className="relative h-20 w-24 rounded-lg overflow-hidden flex-shrink-0">
                  <Image
                    src={fixImageUrl(p.imageUrl) || "/placeholder.svg"}
                    alt={p.name}
                    fill
                    className="object-cover"
                  />
                </div>

                <div className="flex-1">
                  <div className="font-extrabold uppercase text-sm sm:text-base">
                    {p.name}
                  </div>
                  <div className="text-sm text-muted-foreground line-clamp-2">
                    {p.description || ""}
                  </div>
                  <div className="mt-2 text-lg font-extrabold text-[var(--brand-color)]">
                    {fmtPrice(p.price)}
                  </div>
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
