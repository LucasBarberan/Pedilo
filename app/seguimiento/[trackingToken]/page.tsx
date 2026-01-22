"use client";

import { useEffect, useState } from "react";
import SiteHeader from "@/components/site-header";
import { useRouter } from "next/navigation";
import OrderTimeline, { OrderState } from "@/components/order-timeline";
import TrackingStatus from "@/components/tracking-status";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface OrderData {
    orderNumber: number;
    type: "DELIVERY" | "TAKEAWAY";
    clientStatus: OrderState;
    createdAt: string;
    completedAt: string | null;
    cancelled: boolean;
    error?: string;
}

export default function TrackingPage({ params }: { params: { trackingToken: string } }) {
    const router = useRouter();
    const [data, setData] = useState<OrderData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Polling every 30 seconds to keep it simple as per requirements (or just fetch once)
        // Requirements said "No processes in background", but "WebSocket reuse" or "poll on request".
        // For specific requirement "The logic is evaluated in each request of the tracking endpoint",
        // we fetch now.

        // We can implement a simple polling or just basic effect.
        // Let's do a simple fetch first.

        const fetchStatus = async () => {
            try {
                const res = await fetch(`/api/orders/track/${params.trackingToken}`);
                if (!res.ok) {
                    if (res.status === 404) {
                        setData({ error: "Pedido no encontrado" } as any);
                    }
                    return;
                }
                const json = await res.json();
                setData(json);
            } catch (e) {
                console.error("Error fetching order status", e);
            } finally {
                setLoading(false);
            }
        };

        fetchStatus();

        // Optional polling
        const interval = setInterval(fetchStatus, 15000);
        return () => clearInterval(interval);

    }, [params.trackingToken]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="animate-spin text-[var(--brand-color)] w-8 h-8" />
            </div>
        );
    }

    if (!data || data.error) {
        if (!data || data.error) {
            return (
                <div className="min-h-screen bg-gray-50">
                    <SiteHeader showBack={false} />
                    <div className="h-[6px] w-full bg-white" />

                    <main className="max-w-md mx-auto p-4 space-y-6">
                        <div className="text-center mt-4">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Seguimiento</p>
                        </div>

                        <div className="flex flex-col items-center text-center p-6 bg-white rounded-3xl shadow-sm border border-gray-100">
                            <div className="p-4 rounded-full bg-gray-50 mb-4 text-gray-400 bg-opacity-10">
                                <span className="text-4xl">🤷‍♂️</span>
                            </div>
                            <h2 className="text-xl font-bold mb-2">Pedido no encontrado</h2>
                            <p className="text-muted-foreground mb-6">El link puede ser incorrecto o haber expirado.</p>
                            <Button className="w-full rounded-xl" onClick={() => router.push("/")}>Ir al inicio</Button>
                        </div>
                    </main>
                </div>
            );
        }
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <SiteHeader showBack={false} />
            {/* Brand strip */}
            <div className="h-[6px] w-full bg-white" />

            <main className="max-w-md mx-auto p-4 space-y-6">

                {/* Header simple */}
                <div className="text-center mt-4">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Seguimiento</p>
                    <h1 className="text-2xl font-bold">Pedido #{data.orderNumber}</h1>
                </div>

                {/* Status Card */}
                <TrackingStatus status={data.clientStatus} type={data.type} />

                {/* Timeline (Only if not cancelled and not generic error) */}
                {!data.cancelled && (
                    <OrderTimeline status={data.clientStatus} type={data.type} />
                )}

                {/* Whatsapp Button if needed? Requirement said "No modification to existing logic", 
            but usually a contact button is nice. Requirements "8.3 Panatalla Pedido Cancelado Message: communicate con el local".
        */}
                <div className="text-center pt-8">
                    <Button
                        variant="outline"
                        className="w-full rounded-xl"
                        onClick={() => {
                            const phone = process.env.NEXT_PUBLIC_WA_NUMBER || "";
                            window.open(`https://wa.me/${phone.replace(/\D/g, "")}`, "_blank");
                        }}
                    >
                        ¿Necesitás ayuda? Contactanos
                    </Button>
                </div>

            </main>
        </div>
    );
}
