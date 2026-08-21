import HomeScreen from "@/components/home-screen";
import EntryScreen from "@/components/entry-screen";
import { fetchCategories } from "@/lib/categories";
import { getTableReservationsMode } from "@/lib/tableReservations";

export default async function HomePage() {
  const categories = await fetchCategories();
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? null;

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
