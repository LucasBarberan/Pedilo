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

let _configCache: boolean | null = null;
let _configPromise: Promise<boolean> | null = null;

/**
 * Consulta si el módulo DELIVERY_PRICING está habilitado. Se llama ANTES de
 * montar el autocomplete de Google Places — con el módulo apagado no hay que
 * gastar ninguna cuota de Google (ni Places client-side, ni Geocoding/Routes
 * server-side), ver openspec/changes/delivery-pricing/design.md punto 6.
 */
export async function fetchDeliveryPricingEnabled(): Promise<boolean> {
  if (_configCache !== null) return _configCache;
  if (_configPromise) return _configPromise;

  _configPromise = (async () => {
    try {
      if (!API) return false;
      const res = await fetch(`${API}/delivery/config`, { cache: "no-store" });
      if (!res.ok) return false;
      const body = await res.json();
      const enabled = Boolean(body?.data?.enabled);
      _configCache = enabled;
      return enabled;
    } catch {
      return false;
    } finally {
      _configPromise = null;
    }
  })();

  return _configPromise;
}

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
