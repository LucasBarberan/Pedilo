// components/category-menu.tsx
"use client";
import { useRouter } from "next/navigation";
import Image from "next/image";

export type Category = {
  id: string | number;
  name: string;
  code?: number | string;
  imageUrl?: string | null;
  isDefault?: boolean;
  isComboCategory?: boolean;
};

export type CategoryMenuProps = {
  categories: Category[];
  onCategorySelect?: (slugOrCode: string) => void;
  onCartClick?: () => void;
};

function slugify(s: string) {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s-]/g, "")
    .trim().replace(/\s+/g, "-");
}

export default function CategoryMenu({ categories, onCategorySelect }: CategoryMenuProps) {
  const router = useRouter();

  const handleClick = (c: Category) => {
    const slug = slugify(c.name);
    const id = encodeURIComponent(String(c.id));
    if (c.isComboCategory) {
      router.push(`/combos?categoryId=${id}`);
    } else {
      router.push(`/categoria/${encodeURIComponent(slug)}?id=${id}`);
    }
    onCategorySelect?.(slug);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      {categories.map((c) => {
        const imgSrc =
          (c.imageUrl && c.imageUrl.trim()) ? c.imageUrl : "/brand/SraBurga.png"; // ← fallback
        return (
          <button
            key={String(c.id)}
            onClick={() => handleClick(c)}
            className="group rounded-2xl bg-white/70 ring-1 ring-black/5 shadow-sm p-4 h-52
                      flex flex-col items-center justify-center gap-3
                      hover:shadow-md hover:bg-white/80 transition"
          >
            <div className="relative h-28 w-28">
              <Image
                src={imgSrc}
                alt={c.name}
                fill
                className="object-contain group-hover:scale-[1.03] transition drop-shadow"
                unoptimized
              />
            </div>
            <span className="text-base sm:text-lg font-extrabold uppercase text-center line-clamp-2">
              {c.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
