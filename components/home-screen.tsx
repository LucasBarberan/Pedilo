"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import SiteHeader from "@/components/site-header";
import CategoryMenu from "@/components/category-menu";
import ClosedBanner from "@/components/closed-banner";
import InfoBanner from "@/components/info-banner";
import BlockingLoader from "@/components/blocking-loader";
import { fetchCategories } from "@/lib/categories";
import type { Category } from "@/lib/categories";

type HomeScreenProps = {
  initialCategories: Category[];
  apiBase?: string | null;
};

export default function HomeScreen({ initialCategories, apiBase }: HomeScreenProps) {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [loading, setLoading] = useState(initialCategories.length === 0 && !!apiBase);

  useEffect(() => {
    const shouldFetchOnClient = initialCategories.length === 0 && !!apiBase;
    if (!shouldFetchOnClient) return;

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const data = await fetchCategories({ baseUrl: apiBase ?? undefined, signal: controller.signal });
        if (!cancelled) {
          // 🔹 Ordenar: primero las categorías de tipo combo
          const sorted = [...data].sort((a, b) => {
            const aIsCombo = !!a.isComboCategory;
            const bIsCombo = !!b.isComboCategory;
            if (aIsCombo && !bIsCombo) return -1;
            if (!aIsCombo && bIsCombo) return 1;
            return 0; // mantiene el orden original del resto
          });
          setCategories(sorted);
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
  }, [initialCategories.length, apiBase]);

  const handleCartClick = () => router.push("/carrito");

  // 🔹 Aplicar el mismo criterio si las categorías vienen del SSR
  const sortedCategories = [...categories].sort((a, b) => {
    const aIsCombo = !!a.isComboCategory;
    const bIsCombo = !!b.isComboCategory;
    if (aIsCombo && !bIsCombo) return -1;
    if (!aIsCombo && bIsCombo) return 1;
    return 0;
  });

  return (
    <div className="bg-background relative">
      <SiteHeader onCartClick={handleCartClick} />
      <div className="h-[6px] w-full bg-white" />
      <ClosedBanner />
      <InfoBanner />

      <CategoryMenu
        categories={sortedCategories}
        onCartClick={handleCartClick}
      />

      <BlockingLoader open={loading} message="Preparando la carta..." />
    </div>
  );
}
