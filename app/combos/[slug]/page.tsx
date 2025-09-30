import { notFound, redirect } from "next/navigation";

import ComboDetailPage from "@/components/combo-page";
import { fetchComboDetail } from "@/lib/api/combos";
import { isAllowedForDelivery } from "@/lib/channel";

interface ComboPageProps {
  params: { slug: string };
}

export default async function ComboPage({ params }: ComboPageProps) {
  const comboId = params.slug;
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? null;

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
