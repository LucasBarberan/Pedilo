"use client";

import SiteHeader from "@/components/site-header";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
        const prods: Product[] =
          Array.isArray(json)
            ? json
            : Array.isArray(json?.data)
            ? json.data
            : Array.isArray(json?.data?.data)
            ? json.data.data
            : [];

            // dentro del useEffect, luego de obtener `prods`
            const normalize = (arr: any[]) =>
              arr.map((p) => {
              const raw =
              p.price ?? p.basePrice ?? p.finalPrice ?? p.unitPrice; // por si tu back usa otro nombre
              const n =
              typeof raw === "string" ? Number(raw) :
            typeof raw === "number" ? raw : undefined;
            return { ...p, price: n };
          });

          setProducts(normalize(prods));
        setProducts(prods);
      } else {
        setProducts([]);
      }
      
      


      setLoading(false);
    })().catch(() => {
      setCategory(null);
      setProducts([]);
      setLoading(false);
    });
  }, [slug]);

  const title = useMemo(() => {
    if (category?.name) return category.name.toUpperCase();
    if (slug) return String(slug).replace(/-/g, " ").toUpperCase();
    return "CATEGORÍA";
  }, [category, slug]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header con back y carrito como tenías */}
      <SiteHeader
        showBack
        onBack={() => router.back()}
        onCartClick={() => router.push("/carrito")}
      />
      <div className="h-[6px] w-full bg-white" />

      {/* Título debajo del header (sin cambios de CSS) */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-3 pb-2">
        <h2 className="text-2xl font-extrabold uppercase">{title}</h2>
      </div>

      {/* Lista de productos: 1 col mobile / 2 col desktop (sin cambios de CSS) */}
      <div className="mx-auto w-full max-w-6xl px-4 py-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {loading && (
          <div className="col-span-full p-8 text-center opacity-70">
            Cargando...
          </div>
        )}

        {!loading &&
          products.map((p) => (
            <div
              key={String(p.id)}
              onClick={() => router.push(`/producto/${p.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") &&
                router.push(`/producto/${p.id}`)
              }
              className="rounded-2xl bg-white/60 ring-1 ring-black/5 shadow-sm p-4 flex gap-3 cursor-pointer hover:shadow-md transition"
            >
              <div className="relative h-20 w-24 rounded-lg overflow-hidden flex-shrink-0">
                <Image
                  src={
                    p.imageUrl && p.imageUrl.trim()
                      ? p.imageUrl
                      : "/placeholder.svg"
                  }
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
                <div className="mt-2 text-lg font-extrabold text-[#ea562f]">
                  {fmtPrice(p.price)}
                </div>
              </div>
            </div>
          ))}

        {!loading && products.length === 0 && (
          <div className="col-span-full p-8 text-center opacity-70">
            No hay productos en esta categoría.
          </div>
        )}
      </div>
    </div>
  );
}
