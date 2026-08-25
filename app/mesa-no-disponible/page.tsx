import Link from "next/link";
import { QrCode, ArrowLeft } from "lucide-react";

export default function TableUnavailablePage() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <QrCode className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">QR de mesa no disponible</h1>
        <p className="mt-2 text-sm text-slate-600">
          El código no es válido o no pudimos conectarnos con el local. Volvé a escanear el QR colocado en la mesa.
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
