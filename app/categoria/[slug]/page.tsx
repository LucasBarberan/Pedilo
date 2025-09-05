"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import SiteHeader from "@/components/site-header";

type Product = {
  id: string | number;
  name: string;
  description?: string;
  price?: number;
  imageUrl?: string;
  categoryId?: string | number;
  code?: string | number;
};

type Category = {
  id: string | number;
  code?: string | number;
  name: string;
};

const fmtPrice = (n?: number) =>
  typeof n === "number" ? `$${n.toLocaleString("es-AR")}` : "-";

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

      // 1) Traigo todas las categorías y resuelvo la que corresponde al slug
      const catsRes = await fetch(`${BASE}/categories`, { cache: "no-store" });
      const cats: Category[] = await catsRes.json();

      const cat =
        cats.find((c) => slugify(c.name) === slug) ||
        cats.find((c) => String(c.code) === String(slug));

      setCategory(cat ?? null);

      let prods: Product[] = [];

      if (cat) {
        // 2) Primero intento por categoryId = cat.id
        const resById = await fetch(
          `${BASE}/products?categoryId=${encodeURIComponent(String(cat.id))}`,
          { cache: "no-store" }
        );
        const byId: Product[] = await resById.json();
        prods = Array.isArray(byId) ? byId : [];

        // 3) Si vino vacío, intento por code = cat.code (por si esa es tu relación)
        if (prods.length === 0 && cat.code != null) {
          const resByCode = await fetch(
            `${BASE}/products?code=${encodeURIComponent(String(cat.code))}`,
            { cache: "no-store" }
          );
          const byCode: Product[] = await resByCode.json();
          prods = Array.isArray(byCode) ? byCode : [];
        }
      }

      setProducts(prods);
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

      {/* Título debajo del header (no tocamos tu CSS global) */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-3 pb-2">
        <h2 className="text-2xl font-extrabold uppercase">{title}</h2>
      </div>

      {/* Lista de productos: 1 col mobile / 2 col desktop */}
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
