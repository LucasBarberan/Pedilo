// components/category-menu.tsx
"use client";
import { useRouter } from "next/navigation";
import Image from "next/image";

export type Category = {
  id: string | number;
  name: string;
  code?: number | string;
  imageUrl?: string;
  isDefault?: boolean;
  isComboCategory?: boolean;
};

export type CategoryMenuProps = {
  categories: Category[];
  onCategorySelect?: (slugOrCode: string) => void; // <- ahora OPCIONAL
  onCartClick?: () => void;
};

function slugify(s: string) {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s-]/g, "")
    .trim().replace(/\s+/g, "-");
}

function CategoryMenu({ categories, onCategorySelect }: CategoryMenuProps) {
  const router = useRouter();

  const handleClick = (c: Category) => {
    const slug = slugify(c.name);
    const id = encodeURIComponent(String(c.id));

    if (c.isComboCategory) {
      // combos -> /combos?categoryId=<ID>
      router.push(`/combos?categoryId=${id}`);
    } else {
      // normal -> /categoria/[slug]?id=<ID>
      router.push(`/categoria/${encodeURIComponent(slug)}?id=${id}`);
    }

    // si querés mantener alguna UI externa:
    onCategorySelect?.(slug);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 grid grid-cols-1 gap-4 md:grid-cols-3">
      {categories.map((c) => (
        <button
          key={String(c.id)}
          onClick={() => handleClick(c)}
          className="rounded-2xl bg-white/60 ring-1 ring-black/5 shadow-sm p-4 h-48 flex items-center justify-center"
        >
          <span className="text-xl font-extrabold uppercase">{c.name}</span>
        </button>
      ))}
    </div>
  );
}

export default CategoryMenu;
