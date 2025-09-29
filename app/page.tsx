import HomeScreen from "@/components/home-screen";
import { fetchCategories } from "@/lib/categories";

export default async function HomePage() {
  const categories = await fetchCategories();
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? null;

  return (
    <HomeScreen
      initialCategories={categories}
      apiBase={apiBase}
    />
  );
}
