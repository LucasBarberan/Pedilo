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

        // ✅ extrae array ya sea {data: []} o {data: {data: []}}
        const cats =
          Array.isArray(json)
            ? json
            : Array.isArray(json?.data)
            ? json.data
            : Array.isArray(json?.data?.data)
            ? json.data.data
            : [];

        setCategories(cats as Category[]);
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
