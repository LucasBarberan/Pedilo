import { useEffect, useState } from "react";
import io, { Socket } from "socket.io-client";

export interface OrderData {
    orderNumber: number;
    type: "DELIVERY" | "TAKEAWAY";
    clientStatus: "PENDING" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELED";
    createdAt: string;
    completedAt: string | null;
    cancelled: boolean;
    error?: string;
}

interface SocketOrderEvent {
    orderNumber: number;
    status: string;
    updatedAt: string;
}

// Traduce estados a mensajes amigables para notificaciones
function getNotificationMessage(status: string, orderNumber: number, type: string): { title: string; body: string } {
    const statusMessages: Record<string, string> = {
        'PENDING': 'Tu pedido está pendiente',
        'PREPARING': 'Se está preparando tu pedido',
        'READY': type === 'DELIVERY' ? 'Tu pedido está listo para enviar' : 'Tu pedido está listo para retirar',
        'OUT_FOR_DELIVERY': 'Tu pedido está en camino',
        'DELIVERED': type === 'DELIVERY' ? 'Tu pedido ha sido entregado' : 'Tu pedido está listo',
        'CANCELED': 'Tu pedido ha sido cancelado',
    };

    return {
        title: `Pedido #${orderNumber}`,
        body: statusMessages[status] || `Estado: ${status}`
    };
}

// Normaliza datos del backend al formato esperado por el frontend
function normalizeOrderData(data: any): OrderData {
    const type = data.type || 'TAKEAWAY';
    let backendStatus = data.status || data.clientStatus || 'PENDING';
    let cancelled = data.cancelled || false;

    let clientStatus: "PENDING" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELED";

    // Map backend status to frontend clientStatus
    if (backendStatus === 'PENDING') {
        clientStatus = 'PENDING';
    } else if (backendStatus === 'PREPARING') {
        clientStatus = 'PREPARING';
    } else if (backendStatus === 'READY') {
        clientStatus = 'READY';
    } else if (backendStatus === 'COMPLETED') {
        // COMPLETED = ya se retiró (TAKEAWAY) o ya fue entregado (DELIVERY)
        clientStatus = 'DELIVERED';

        // Para DELIVERY: si COMPLETED fue hace menos de 1 hora, podría estar aún en camino
        if (type === 'DELIVERY') {
            const lastUpdate = data.completedAt || data.updatedAt;
            if (lastUpdate) {
                const updateTime = new Date(lastUpdate).getTime();
                const now = Date.now();
                const diffMinutes = (now - updateTime) / (1000 * 60);

                // Si pasó menos de 5 minutos desde COMPLETED, aún está en camino (testing)
                // En producción cambiar a 60 minutos
                if (diffMinutes < 60) {
                    clientStatus = 'OUT_FOR_DELIVERY';
                }
            }
        }
    } else if (backendStatus === 'OUT_FOR_DELIVERY') {
        clientStatus = 'OUT_FOR_DELIVERY';
    } else if (backendStatus === 'DELIVERED') {
        clientStatus = 'DELIVERED';
    } else if (backendStatus === 'CANCELED' || backendStatus === 'CANCELLED') {
        clientStatus = 'CANCELED';
        cancelled = true;
    } else {
        clientStatus = 'PENDING';
    }

    return {
        orderNumber: data.orderNumber,
        type,
        clientStatus,
        createdAt: data.createdAt || new Date().toISOString(),
        completedAt: data.completedAt || data.updatedAt || null,
        cancelled,
        error: data.error,
    };
}

export function useOrderTracking(trackingToken: string) {
    const [data, setData] = useState<OrderData | null>(null);
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(false);
    const [usingFallback, setUsingFallback] = useState(false);

    useEffect(() => {
        let socket: Socket | null = null;
        let pollInterval: number | null = null;

        // Request notification permission on mount
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }

        // Fallback: HTTP polling
        const startPolling = () => {
            setUsingFallback(true);
            const fetchStatus = async () => {
                try {
                    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
                    const res = await fetch(`${apiUrl}/orders/track/${trackingToken}?t=${Date.now()}`, {
                        cache: "no-store",
                    });
                    if (!res.ok) {
                        if (res.status === 404) {
                            setData({ error: "Pedido no encontrado" } as any);
                        }
                        return;
                    }
                    const json = await res.json();
                    const rawData = json.data || json;
                    const normalizedData = normalizeOrderData(rawData);
                    setData(normalizedData);
                } catch (e) {
                    console.error("Error fetching order status (polling)", e);
                } finally {
                    setLoading(false);
                }
            };

            fetchStatus();
            pollInterval = window.setInterval(fetchStatus, 15000);
        };

        // WebSocket connection
        try {
            const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";

            console.log("Connecting to Socket.IO at:", socketUrl);

            socket = io(socketUrl, {
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: 5,
                transports: ["websocket", "polling"],
            });

            socket.on("connect", () => {
                console.log("✅ WebSocket connected");
                setConnected(true);
                setUsingFallback(false);

                // Join tracking room
                socket!.emit("joinOrderTracking", trackingToken);
            });

            socket.on("orderStatusChanged", (event: SocketOrderEvent) => {
                console.log("Order status changed via WebSocket:", event);

                // Fetch fresh data from API to get all fields
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
                fetch(`${apiUrl}/orders/track/${trackingToken}?t=${Date.now()}`, {
                    cache: "no-store",
                })
                    .then((res) => {
                        console.log("Fetch response status:", res.status);
                        return res.json();
                    })
                    .then((json) => {
                        console.log("Fresh data from API:", json);
                        const rawData = json.data || json;
                        const normalizedData = normalizeOrderData(rawData);
                        console.log("Setting data to:", normalizedData);
                        setData(normalizedData);
                        setLoading(false);

                        // Send browser notification
                        if ("Notification" in window && Notification.permission === "granted") {
                            const { title, body } = getNotificationMessage(event.status, event.orderNumber, normalizedData.type);
                            new Notification(title, {
                                body,
                                icon: "/brand/SraBurgaLogo.png",
                                badge: "/brand/SraBurgaLogo.png"
                            });
                        }
                    })
                    .catch((e) => console.error("Error fetching fresh data after WS event:", e));
            });

            socket.on("disconnect", () => {
                console.log("WebSocket disconnected");
                setConnected(false);

                // Fallback to polling
                startPolling();
            });

            socket.on("error", (error: any) => {
                console.error("WebSocket error:", error);
                setConnected(false);

                // Fallback to polling
                startPolling();
            });

            // Initial fetch via HTTP while waiting for WebSocket
            (async () => {
                try {
                    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
                    const res = await fetch(`${apiUrl}/orders/track/${trackingToken}?t=${Date.now()}`, {
                        cache: "no-store",
                    });
                    if (!res.ok) {
                        if (res.status === 404) {
                            setData({ error: "Pedido no encontrado" } as any);
                        }
                        return;
                    }
                    const json = await res.json();
                    const rawData = json.data || json;
                    const normalizedData = normalizeOrderData(rawData);
                    setData(normalizedData);
                } catch (e) {
                    console.error("Error fetching initial order status", e);
                } finally {
                    setLoading(false);
                }
            })();
        } catch (error) {
            console.error("Failed to initialize WebSocket:", error);
            startPolling();
        }

        return () => {
            if (socket) {
                socket.disconnect();
            }
            if (pollInterval) {
                clearInterval(pollInterval);
            }
        };
    }, [trackingToken]);

    return { data, loading, connected, usingFallback };
}
