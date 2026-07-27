"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import { Loader2 } from "lucide-react";

/**
 * Página de retorno post-pago de Mercado Pago — mientras la orden sigue en
 * PAYMENT_PENDING (esperando el webhook de confirmación). NUNCA muestra la
 * orden como confirmada por su cuenta: solo hace polling del status real y
 * redirige a /seguimiento una vez que el webhook la confirmó. Ver
 * openspec/changes/mercadopago-marketplace-checkout/design.md.
 */
export default function PedidoProcesandoPage({ params }: { params: { trackingToken: string } }) {
  const router = useRouter();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

    const checkStatus = async () => {
      try {
        const res = await fetch(`${apiUrl}/orders/track/${params.trackingToken}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (res.status === 404 && !cancelled) setNotFound(true);
          return;
        }
        const json = await res.json();
        const status = (json.data ?? json)?.status;
        if (status && status !== "PAYMENT_PENDING" && !cancelled) {
          router.replace(`/seguimiento/${params.trackingToken}`);
        }
      } catch {
        // red intermitente — se reintenta en el próximo poll, sin romper la UI
      }
    };

    checkStatus();
    const interval = window.setInterval(checkStatus, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [params.trackingToken, router]);

  return (
    <div className="flex flex-col flex-1 bg-gray-50">
      <SiteHeader showBack={false} />
      <main className="flex-1 max-w-md mx-auto p-4 w-full flex flex-col items-center justify-center text-center gap-4 min-h-[60vh]">
        {notFound ? (
          <>
            <span className="text-4xl">🤷‍♂️</span>
            <h1 className="text-xl font-bold">Pedido no encontrado</h1>
            <p className="text-muted-foreground">El link puede ser incorrecto o haber expirado.</p>
          </>
        ) : (
          <>
            <Loader2 className="animate-spin text-[var(--brand-color)] w-10 h-10" />
            <h1 className="text-xl font-bold">Estamos confirmando tu pago…</h1>
            <p className="text-muted-foreground">
              Esto puede tardar unos segundos. No cierres esta ventana.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
