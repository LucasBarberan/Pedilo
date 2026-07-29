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

type DeliveryConfigSnapshot = {
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  maxKm: number | null;
};

let _configCache: DeliveryConfigSnapshot | null = null;
let _configPromise: Promise<DeliveryConfigSnapshot> | null = null;

const EMPTY_CONFIG: DeliveryConfigSnapshot = { enabled: false, latitude: null, longitude: null, maxKm: null };

async function loadDeliveryConfig(): Promise<DeliveryConfigSnapshot> {
  if (_configCache !== null) return _configCache;
  if (_configPromise) return _configPromise;

  _configPromise = (async () => {
    try {
      if (!API) return EMPTY_CONFIG;
      const res = await fetch(`${API}/delivery/config`, { cache: "no-store" });
      if (!res.ok) return EMPTY_CONFIG;
      const body = await res.json();
      const snapshot: DeliveryConfigSnapshot = {
        enabled: Boolean(body?.data?.enabled),
        latitude: body?.data?.latitude ?? null,
        longitude: body?.data?.longitude ?? null,
        maxKm: body?.data?.maxKm ?? null,
      };
      _configCache = snapshot;
      return snapshot;
    } catch {
      return EMPTY_CONFIG;
    } finally {
      _configPromise = null;
    }
  })();

  return _configPromise;
}

/**
 * Consulta si el módulo DELIVERY_PRICING está habilitado. Se llama ANTES de
 * montar el autocomplete de Google Places — con el módulo apagado no hay que
 * gastar ninguna cuota de Google (ni Places client-side, ni Geocoding/Routes
 * server-side), ver openspec/changes/delivery-pricing/design.md punto 6.
 */
export async function fetchDeliveryPricingEnabled(): Promise<boolean> {
  const { enabled } = await loadDeliveryConfig();
  return enabled;
}

/**
 * Centro (ubicación del comercio) + radio (maxKm de cobertura configurado)
 * para priorizar sugerencias del autocomplete cercanas a la zona real de
 * delivery — evita mostrar como primera opción una calle homónima en otra
 * provincia. `null` si el comercio todavía no tiene ubicación configurada.
 */
export async function fetchDeliveryLocationBias(): Promise<{ latitude: number; longitude: number; radiusMeters: number } | null> {
  const { latitude, longitude, maxKm } = await loadDeliveryConfig();
  if (latitude == null || longitude == null || maxKm == null) return null;
  return { latitude, longitude, radiusMeters: maxKm * 1000 };
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
