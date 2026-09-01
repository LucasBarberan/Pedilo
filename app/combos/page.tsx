import CombosListScreen from "@/components/combos-list-page";
import { fetchCombos } from "@/lib/api/combos";
import { fetchCategories } from "@/lib/categories";
import { apiBase as resolveApiBase } from "@/lib/apiBase";

interface CombosPageProps {
  searchParams?: {
    categoryId?: string;
  };
}

export default async function CombosPage({ searchParams }: CombosPageProps) {
  // demo-mode Fase 5 (tasks.md 5.4): sin token de demo, comportamiento actual sin cambios.
  const apiBase = await resolveApiBase();
  const categoryId = searchParams?.categoryId ?? null;

  const combos = await fetchCombos({
    baseUrl: apiBase ?? undefined,
    categoryId: categoryId ?? undefined,
    withItems: true,
    withEffectivePrice: true,
    onlyActive: true,
    onlyDeliveryAllowed: true,
    onlyComboCategory: true,
  });

  let categoryName: string | null = null;
  if (categoryId) {
    const match = combos.find((combo) => {
      const current = combo.categoryId ?? combo.category?.id;
      return String(current ?? "") === String(categoryId);
    });
    categoryName = match?.categoryName ?? match?.category?.name ?? null;

    if (!categoryName) {
      const categories = await fetchCategories({ baseUrl: apiBase ?? undefined });
      const found =
        categories.find((cat) => String(cat.id) === String(categoryId)) ??
        categories.find((cat) => String(cat.code ?? "") === String(categoryId));
      categoryName = found?.name ?? null;
    }
  }

  return (
    <CombosListScreen
      initialCombos={combos}
      categoryName={categoryName}
      categoryId={categoryId}
      apiBase={apiBase}
    />
  );
}
