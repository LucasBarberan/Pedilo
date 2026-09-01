import HomeScreen from "@/components/home-screen";
import EntryScreen from "@/components/entry-screen";
import { fetchCategories } from "@/lib/categories";
import { getTableReservationsMode } from "@/lib/tableReservations";
import { apiBase as resolveApiBase } from "@/lib/apiBase";

export default async function HomePage() {
  // demo-mode Fase 5 (tasks.md 5.4/5.5): con token de demo devuelve el prefijo
  // ${NEXT_PUBLIC_API_URL}/demo/<token>; sin token, comportamiento actual sin cambios.
  const apiBase = await resolveApiBase();
  // fetchCategories ya aceptaba `baseUrl` (no listado en tasks.md 5.5, pero mismo mecanismo
  // que products/combos/promos/pricing — sin esto la lista de categorías de un demo mostraría
  // el catálogo real de `public`, no el del schema demo_N).
  const categories = await fetchCategories({ baseUrl: apiBase });

  if (getTableReservationsMode() !== "off") {
    return <EntryScreen initialCategories={categories} apiBase={apiBase} />;
  }

  return (
    <HomeScreen
      initialCategories={categories}
      apiBase={apiBase}
    />
  );
}
