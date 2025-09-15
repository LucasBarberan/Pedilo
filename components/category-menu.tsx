// components/category-menu.tsx
"use client";
import Image from "next/image";

export type Category = {
  id: string | number;
  name: string;
  code?: number | string;
  imageUrl?: string;
  isDefault?: boolean; // 👈 nuevo (opcional)
};

export type CategoryMenuProps = {
  categories: Category[];
  onCategorySelect: (slugOrCode: string) => void;
  onCartClick?: () => void; // opcional
};

function slugify(s: string) {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s-]/g, "")
    .trim().replace(/\s+/g, "-");
}

function CategoryMenu({ categories, onCategorySelect }: CategoryMenuProps) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 grid grid-cols-1 gap-4 md:grid-cols-3">
      {categories.map((c) => (
        <button
          key={String(c.id)}
          onClick={() => onCategorySelect(slugify(c.name))}
          className="rounded-2xl bg-white/60 ring-1 ring-black/5 shadow-sm p-4 h-48 flex items-center justify-center"
        >
          <span className="text-xl font-extrabold uppercase">{c.name}</span>
        </button>
      ))}
    </div>
  );
}

export default CategoryMenu; // <<--- IMPORTANTE
