import Link from "next/link";
import { Sparkles, ArrowLeft } from "lucide-react";

export default function DemoUnavailablePage() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-violet-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <Sparkles className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Demo no disponible</h1>
        <p className="mt-2 text-sm text-slate-600">
          El link de demo no es válido o ya expiró. Pedí un link nuevo a quien te compartió esta demo.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--brand-color)] px-4 py-2 text-sm font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Ir al menú
        </Link>
      </div>
    </main>
  );
}
