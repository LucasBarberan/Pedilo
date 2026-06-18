import Link from "next/link";

export function TestModeBanner() {
  return (
    <Link
      href="/tecnico"
      className="block w-full bg-amber-500 text-black text-center text-sm font-medium py-1.5 sticky top-0 z-50"
    >
      🧪 MODO PRUEBA — los pedidos no afectan los datos reales
    </Link>
  );
}
