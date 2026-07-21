import { cookies } from "next/headers";
import TecnicoForm from "./tecnico-form";

export const metadata = { robots: { index: false, follow: false } };

export default async function TecnicoPage() {
  const cookieStore = await cookies();
  const active = !!cookieStore.get("pedilo_test_token")?.value;

  return <TecnicoForm initialActive={active} />;
}
