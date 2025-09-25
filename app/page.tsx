"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import CategoryMenu, { type Category } from "@/components/category-menu";
import ClosedBanner from "@/components/closed-banner";

export default function Home() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const BASE = process.env.NEXT_PUBLIC_API_URL;
    if (!BASE) return;

    (async () => {
      try {
        const res = await fetch(`${BASE}/categories`, { cache: "no-store" });
        const json = await res.json();

        // Soportamos { data: [...] } o un array plano
        const raw: Category[] = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);

        // Orden: isDefault true primero; luego por sortOrder (si existe), luego por nombre
        const sorted = [...raw].sort((a: any, b: any) => {
          if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
          const soA = typeof a.sortOrder === "number" ? a.sortOrder : Number.MAX_SAFE_INTEGER;
          const soB = typeof b.sortOrder === "number" ? b.sortOrder : Number.MAX_SAFE_INTEGER;
          if (soA !== soB) return soA - soB;
          return String(a.name || "").localeCompare(String(b.name || ""), "es");
        });

        setCategories(sorted);
      } catch {
        setCategories([]); // sin fallback “COMBOS” fijo
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCartClick = () => {
    router.push("/carrito");
  };

  if (loading) return <div className="p-6">Cargando…</div>;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader onCartClick={handleCartClick} />
      <div className="h-[6px] w-full bg-white" />

      {/* Banner “local cerrado” debajo del header */}
      <ClosedBanner />

      <CategoryMenu
        categories={categories}
        // Nota: CategoryMenu ya hace router.push interno
        // (normales → /categoria/[slug]?id=<ID>, combos → /combos?categoryId=<ID>)
        onCartClick={handleCartClick}
      />
    </div>
  );
}
