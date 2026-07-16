// lib/api/delivery.ts

export type DeliveryQuoteRequest = {
  address?: string;
  placeId?: string;
  /** Coordenadas directas — arrastrar el pin en el mapa (sin placeId asociado). */
  latitude?: number;
  longitude?: number;
};

export type LatLng = { latitude: number; longitude: number };

export type DeliveryQuoteResponse = {
  distanceKm: number;
  price: number | null;
  addressResolved: string | null;
  withinCoverage: boolean;
  fallback: boolean;
  businessLocation: LatLng | null;
  destinationLocation: LatLng | null;
};

const API = process.env.NEXT_PUBLIC_API_URL; // ej: http://localhost:5000/api

/**
 * Cotiza el costo de envío según distancia real al comercio. El precio
 * devuelto acá es solo para mostrarlo en pantalla — el Backend vuelve a
 * calcularlo de forma independiente al confirmar el pedido (server-authoritative,
 * ver openspec/changes/delivery-pricing/design.md).
 */
export async function fetchDeliveryQuote(input: DeliveryQuoteRequest): Promise<DeliveryQuoteResponse> {
  if (!API) throw new Error("Falta NEXT_PUBLIC_API_URL");

  const res = await fetch(`${API}/delivery/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error || "No se pudo cotizar el envío");
  }

  return body.data as DeliveryQuoteResponse;
}
