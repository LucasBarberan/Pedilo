import { redirect } from "next/navigation";

import CategoryPageClient from "@/components/category-page";
import { fetchCategories } from "@/lib/categories";
import { fetchProductsByCategory } from "@/lib/api/products";
import type { Product } from "@/lib/api/products";
import type { Category } from "@/lib/categories";

type CategoryPageProps = {
  params: { slug: string };
  searchParams?: { id?: string };
};

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const slug = params.slug;
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? null;

  if (slug && slug.toLowerCase() === "combos") {
    redirect("/combos");
  }

  const categories = await fetchCategories({ baseUrl: apiBase ?? undefined });
  const normalizedSlug = slugify(slug);

  let category: Category | null =
    categories.find((c) => slugify(c.name) === normalizedSlug) ??
    null;

  const searchId = searchParams?.id;
  if (!category && searchId) {
    category =
      categories.find((c) => String(c.id) === String(searchId)) ??
      categories.find((c) => String(c.code ?? "") === String(searchId)) ??
      null;
  }

  let products: Product[] = [];

  if (category) {
    products = await fetchProductsByCategory(category.id, { baseUrl: apiBase ?? undefined });
  }

  return (
    <CategoryPageClient
      slug={slug}
      category={category}
      initialProducts={products}
      apiBase={apiBase}
    />
  );
}
