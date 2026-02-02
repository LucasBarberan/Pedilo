import { CheckCircle2, XCircle, Clock, ChefHat, ShoppingBag, Truck } from "lucide-react";

type ClientStatus = "PENDING" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELED";

interface TrackingStatusProps {
    status: ClientStatus;
    type: "DELIVERY" | "TAKEAWAY";
}

export default function TrackingStatus({ status, type }: TrackingStatusProps) {
    const messages: Record<ClientStatus, { title: string; subtitle: string; icon: any; color: string }> = {
        PENDING: {
            title: "Recibimos tu pedido",
            subtitle: "Estamos confirmando los detalles.",
            icon: Clock,
            color: "text-orange-500",
        },
        PREPARING: {
            title: "Manos a la obra",
            subtitle: "Estamos preparando tu pedido.",
            icon: ChefHat,
            color: "text-blue-500",
        },
        READY: {
            title: type === "TAKEAWAY" ? "¡Listo para retirar!" : "Pedido preparado",
            subtitle: type === "TAKEAWAY"
                ? "Podés pasar a buscarlo por el local."
                : "Estamos esperando al repartidor.",
            icon: ShoppingBag,
            color: "text-green-600",
        },
        OUT_FOR_DELIVERY: {
            title: "¡Tu pedido está en camino!",
            subtitle: "El repartidor está yendo a tu domicilio.",
            icon: Truck,
            color: "text-[var(--brand-color)]",
        },
        DELIVERED: {
            title: "¡Pedido entregado!",
            subtitle: "Gracias por elegirnos. ¡Que lo disfrutes!",
            icon: CheckCircle2,
            color: "text-green-600",
        },
        CANCELED: {
            title: "Pedido cancelado",
            subtitle: "Si tenés dudas, comunicate con nosotros.",
            icon: XCircle,
            color: "text-red-500",
        },
    };

    const current = messages[status] || messages.PENDING;
    const Icon = current.icon;

    return (
        <div className="flex flex-col items-center text-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100">
            <div className={`p-4 rounded-full bg-gray-50 mb-4 ${current.color} bg-opacity-10`}>
                <Icon className={`w-12 h-12 ${current.color}`} />
            </div>
            <h2 className="text-xl font-bold mb-2">{current.title}</h2>
            <p className="text-muted-foreground">{current.subtitle}</p>
        </div>
    );
}
