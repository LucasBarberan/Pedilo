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

        // Orden: isDefault true primero; luego por nombre (opcional)
        const sorted = [...raw].sort((a: any, b: any) => {
          if (!!a.isDefault === !!b.isDefault) {
            return String(a.name || "").localeCompare(String(b.name || ""), "es");
          }
          return a.isDefault ? -1 : 1; // true va primero
        });

        // Agregamos item virtual "COMBOS" que navega a /categoria/combos
        const hasCombos = sorted.some(
          (c: any) =>
            String(c.id).toLowerCase() === "combos" ||
            String(c.code ?? "").toLowerCase() === "combos" ||
            String(c.name ?? "").toLowerCase() === "combos"
        );

        const withCombos: Category[] = hasCombos
          ? sorted as Category[]
          : [
              ...sorted,
              {
                id: "combos",
                // @ts-ignore (si tu tipo Category no tiene code, no pasa nada)
                code: "COMBOS",
                name: "COMBOS",
                // @ts-ignore (si tu tipo no define imageUrl, se ignora)
                imageUrl: "/combos-placeholder.png",
              } as Category,
            ];

        setCategories(withCombos);
      } catch {
        // fallback mínimo con sólo COMBOS
        setCategories([
          {
            id: "combos",
            // @ts-ignore
            code: "COMBOS",
            name: "COMBOS",
          } as Category,
        ]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCategorySelect = (slug: string) => {
  if (slug.toLowerCase() === "combos") {
    router.push("/combos");
  } else {
    router.push(`/categoria/${encodeURIComponent(slug)}`);
  }
};

  const handleCartClick = () => {
    router.push("/carrito");
  };

  if (loading) return <div className="p-6">Cargando…</div>;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader onCartClick={handleCartClick} />
      <div className="h-[6px] w-full bg-white" />

      {/* Banner “local cerrado” debajo del header (área roja que marcaste) */}
      <ClosedBanner />
      
      <CategoryMenu
        categories={categories}
        onCategorySelect={handleCategorySelect}
        onCartClick={handleCartClick}
      />
    </div>
  );
}
