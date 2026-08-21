"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChefHat, Clock, Loader2, Receipt, ShoppingBag, XCircle } from "lucide-react";
import SiteHeader from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { useOnlineConfig } from "@/lib/hooks/useOnlineConfig";
import { useTableOrder } from "@/components/table-order-context";

type GuestCommandStatus = "PENDING" | "ACCEPTING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
type AcceptedOrderStatus = "PENDING" | "SCHEDULED" | "CONFIRMED" | "PREPARING" | "ASSEMBLED" | "READY" | "COMPLETED" | "CANCELLED";

type GuestCommandTracking = {
  id: number;
  status: GuestCommandStatus;
  trackingToken: string;
  rejectionReason?: string | null;
  originTable?: { code: string; name: string } | null;
  acceptedOrder?: { id: number; orderNumber: number; status: AcceptedOrderStatus } | null;
};

type ViewState =
  | { stage: "waiting_review" }
  | { stage: "rejected"; reason?: string | null }
  | { stage: "cancelled" }
  | { stage: "preparing" }
  | { stage: "ready" }
  | { stage: "delivered" };

function resolveViewState(command: GuestCommandTracking): ViewState {
  if (command.status === "REJECTED") return { stage: "rejected", reason: command.rejectionReason };
  if (command.status === "CANCELLED") return { stage: "cancelled" };
  if (command.status === "PENDING" || command.status === "ACCEPTING") return { stage: "waiting_review" };

  const orderStatus = command.acceptedOrder?.status;
  if (orderStatus === "READY") return { stage: "ready" };
  if (orderStatus === "COMPLETED") return { stage: "delivered" };
  return { stage: "preparing" };
}

const STAGE_CONTENT: Record<ViewState["stage"], { title: string; subtitle: string; icon: any; color: string }> = {
  waiting_review: {
    title: "Recibimos tu pedido",
    subtitle: "Estamos confirmando los detalles con el personal.",
    icon: Clock,
    color: "text-orange-500",
  },
  preparing: {
    title: "Manos a la obra",
    subtitle: "Estamos preparando tu pedido.",
    icon: ChefHat,
    color: "text-blue-500",
  },
  ready: {
    title: "¡Listo para retirar!",
    subtitle: "Podés pasar a buscarlo por la caja o el mostrador.",
    icon: ShoppingBag,
    color: "text-green-600",
  },
  delivered: {
    title: "¡Pedido entregado!",
    subtitle: "Gracias por tu pedido. ¡Que lo disfrutes!",
    icon: CheckCircle2,
    color: "text-green-600",
  },
  rejected: {
    title: "Pedido rechazado",
    subtitle: "Consultá con el personal del local.",
    icon: XCircle,
    color: "text-red-500",
  },
  cancelled: {
    title: "Solicitud cancelada",
    subtitle: "Esta comanda ya no está activa.",
    icon: XCircle,
    color: "text-red-500",
  },
};

const TERMINAL_STAGES: ViewState["stage"][] = ["delivered", "rejected", "cancelled"];

function trackingTokenKey(tableCode: string) {
  return `pedilo:table:${tableCode}:trackingToken`;
}

export default function MesaSeguimientoPage({ params }: { params: { trackingToken: string } }) {
  const router = useRouter();
  const { config } = useOnlineConfig();
  const { context: tableContext, requestBill } = useTableOrder();
  const [command, setCommand] = useState<GuestCommandTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestingBill, setRequestingBill] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);

  const canRequestBill = tableContext?.state === "OPEN";

  const handleRequestBill = async () => {
    setRequestingBill(true);
    setBillError(null);
    try {
      await requestBill();
    } catch (requestError) {
      setBillError(requestError instanceof Error ? requestError.message : "No se pudo pedir la cuenta");
    } finally {
      setRequestingBill(false);
    }
  };

  useEffect(() => {
    let active = true;

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/table-command-status/${encodeURIComponent(params.trackingToken)}`, {
          cache: "no-store",
        });
        const body = await response.json().catch(() => null);
        if (!active) return;
        if (!response.ok || !body?.success || !body?.data) {
          setError(body?.error || "No pudimos encontrar ese pedido");
          setCommand(null);
        } else {
          setError(null);
          setCommand(body.data);
        }
      } catch {
        if (active) setError("No se pudo conectar con el local");
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchStatus();
    const interval = window.setInterval(() => void fetchStatus(), 8_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [params.trackingToken]);

  const view = command ? resolveViewState(command) : null;

  // Una vez que el pedido llega a un estado terminal, ya no tiene sentido que
  // reabrir el mismo QR siga mandando acá — se limpia para que la próxima
  // apertura muestre el menú normal (ver table-order-context.tsx).
  useEffect(() => {
    if (!view || !command?.originTable || !TERMINAL_STAGES.includes(view.stage)) return;
    try {
      const key = trackingTokenKey(command.originTable.code);
      const stored = localStorage.getItem(key);
      if (stored === params.trackingToken) localStorage.removeItem(key);
    } catch {
      // localStorage no disponible — no rompe el seguimiento en sí
    }
  }, [view, command, params.trackingToken]);

  if (loading) {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-[var(--brand-color)] w-8 h-8" />
      </div>
    );
  }

  if (error || !command || !view) {
    return (
      <div className="flex flex-col flex-1 bg-gray-50">
        <SiteHeader showBack={false} />
        <main className="flex-1 max-w-md mx-auto p-4 space-y-6 w-full">
          <div className="text-center mt-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Seguimiento</p>
          </div>
          <div className="flex flex-col items-center text-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100">
            <div className="p-4 rounded-full bg-gray-50 mb-4 text-gray-400 bg-opacity-10">
              <span className="text-4xl">🤷‍♂️</span>
            </div>
            <h2 className="text-xl font-bold mb-2">Pedido no encontrado</h2>
            <p className="text-muted-foreground mb-6">{error || "El link puede ser incorrecto o haber expirado."}</p>
            <Button className="w-full rounded-xl" onClick={() => router.push("/")}>Ir al inicio</Button>
          </div>
        </main>
      </div>
    );
  }

  const content = STAGE_CONTENT[view.stage];
  const Icon = content.icon;

  return (
    <div className="flex flex-col flex-1 bg-gray-50">
      <SiteHeader showBack={false} />

      <main className="flex-1 max-w-md mx-auto p-4 space-y-6 w-full">
        <div className="text-center mt-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Seguimiento</p>
          <h1 className="text-2xl font-bold">
            {command.originTable?.name ? `Pedido · ${command.originTable.name}` : "Tu pedido"}
          </h1>
        </div>

        <div className="flex flex-col items-center text-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100">
          <div className={`p-4 rounded-full bg-gray-50 mb-4 ${content.color} bg-opacity-10`}>
            <Icon className={`w-12 h-12 ${content.color}`} />
          </div>
          <h2 className="text-xl font-bold mb-2">{content.title}</h2>
          <p className="text-muted-foreground">
            {view.stage === "rejected" && view.reason ? view.reason : content.subtitle}
          </p>
        </div>

        {canRequestBill && (
          <div className="space-y-2">
            <Button
              className="w-full rounded-xl bg-[var(--brand-color)] text-white hover:brightness-95"
              disabled={requestingBill}
              onClick={() => void handleRequestBill()}
            >
              {requestingBill ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
              Pedir la cuenta
            </Button>
            {billError && <p className="text-center text-xs text-red-600">{billError}</p>}
          </div>
        )}

        <Button
          variant="outline"
          className="w-full rounded-xl"
          onClick={() => router.push("/")}
        >
          Agregar algo más
        </Button>

        <div className="text-center pt-4">
          <Button
            variant="ghost"
            className="w-full rounded-xl"
            onClick={() => {
              const phone = (config.waNumber || "").replace(/\D/g, "");
              window.open(`https://wa.me/${phone}`, "_blank");
            }}
          >
            ¿Necesitás ayuda? Contactanos
          </Button>
        </div>
      </main>
    </div>
  );
}
