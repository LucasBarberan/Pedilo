import { notFound, redirect } from "next/navigation";

import ComboDetailPage from "@/components/combo-page";
import { fetchComboDetail } from "@/lib/api/combos";
import { isAllowedForDelivery } from "@/lib/channel";
import { apiBase as resolveApiBase } from "@/lib/apiBase";

interface ComboPageProps {
  params: { slug: string };
}

export default async function ComboPage({ params }: ComboPageProps) {
  const comboId = params.slug;
  // demo-mode Fase 5 (tasks.md 5.4): sin token de demo, comportamiento actual sin cambios.
  const apiBase = await resolveApiBase();

  const { combo, mainProduct, inclusionProducts } = await fetchComboDetail(comboId, {
    baseUrl: apiBase ?? undefined,
  });

  if (!combo) {
    notFound();
  }

  if (!isAllowedForDelivery(combo.channel)) {
    redirect("/");
  }

  return (
    <ComboDetailPage
      combo={combo}
      mainProduct={mainProduct}
      inclusionProducts={inclusionProducts}
    />
  );
}
