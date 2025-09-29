"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import SiteHeader from "@/components/site-header";
import CategoryMenu from "@/components/category-menu";
import ClosedBanner from "@/components/closed-banner";
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
        if (!cancelled) setCategories(data);
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

  return (
    <div className="min-h-screen bg-background relative">
      <SiteHeader onCartClick={handleCartClick} />
      <div className="h-[6px] w-full bg-white" />
      <ClosedBanner />

      <CategoryMenu
        categories={categories}
        onCartClick={handleCartClick}
      />

      <BlockingLoader open={loading} message="Preparando la carta..." />
    </div>
  );
}
