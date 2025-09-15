"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import CategoryMenu, { type Category } from "@/components/category-menu";

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
      const raw = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);

      // Orden: isDefault true primero; luego por nombre (opcional)
      const sorted = [...raw].sort((a, b) => {
        if (!!a.isDefault === !!b.isDefault) {
          return String(a.name || "").localeCompare(String(b.name || ""), "es");
        }
        return a.isDefault ? -1 : 1; // true va primero
      });

        setCategories(sorted as Category[]);
      } catch {
        setCategories([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCategorySelect = (slug: string) => {
    router.push(`/categoria/${encodeURIComponent(slug)}`);
  };

  const handleCartClick = () => {
    router.push("/carrito");
  };

  if (loading) return <div className="p-6">Cargando…</div>;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader onCartClick={handleCartClick} />
      <div className="h-[6px] w-full bg-white" />
      <CategoryMenu
        categories={categories}
        onCategorySelect={handleCategorySelect}
        onCartClick={handleCartClick}
      />
    </div>
  );
}
