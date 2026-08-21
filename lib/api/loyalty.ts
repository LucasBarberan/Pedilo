// lib/api/loyalty.ts

export type LoyaltyCustomerStatus = {
  customerId: number;
  esNuevo: boolean;
  name: string | null;
  phone: string | null;
  addressLine1: string | null;
  saldoEfectivo: number;
  saldoCrudo: number;
  lastEarnedAt: string | null;
  valorDescuentoDisponible: number;
  /** Valor de descuento por punto (ej. 1 = $1 de descuento por punto) */
  ratioCanje: number;
  canjeMinimo: number;
  puedeCanjear: boolean;
  puntosFaltantesParaCanje: number;
};

const API = process.env.NEXT_PUBLIC_API_URL; // ej: http://localhost:5000/api

let _enabledCache: boolean | null = null;
let _enabledPromise: Promise<boolean> | null = null;

/**
 * Consulta si el módulo LOYALTY está habilitado, para no mostrar el campo de
 * DNI ni gastar requests si el negocio no tiene fidelización activa.
 *
 * Usa GET /loyalty/enabled — un endpoint dedicado, sin rate limit, que NO
 * busca nada por DNI (a diferencia de un intento anterior que pegaba contra
 * /loyalty/customer/_probe: ese endpoint SÍ comparte rate limit con las
 * búsquedas reales, así que cada visita al checkout le restaba uno de los
 * pocos intentos disponibles a un cliente real antes de que hiciera ninguna
 * búsqueda de verdad — bug real encontrado). 426 = módulo apagado, 200 =
 * habilitado (mismo patrón que /api/delivery con DELIVERY_PRICING).
 */
export async function fetchLoyaltyEnabled(): Promise<boolean> {
  if (_enabledCache !== null) return _enabledCache;
  if (_enabledPromise) return _enabledPromise;

  _enabledPromise = (async () => {
    try {
      if (!API) return false;
      const res = await fetch(`${API}/loyalty/enabled`, { cache: "no-store" });
      const enabled = res.ok;
      _enabledCache = enabled;
      return enabled;
    } catch {
      return false;
    } finally {
      _enabledPromise = null;
    }
  })();

  return _enabledPromise;
}

/**
 * Busca (o crea) el cliente de fidelización por DNI. Si se pasan datos de
 * contacto y el cliente ya existe, el Backend actualiza los que cambiaron.
 */
export async function fetchLoyaltyStatus(
  dni: string,
  datosContacto?: { name?: string; phone?: string; addressLine1?: string }
): Promise<LoyaltyCustomerStatus> {
  if (!API) throw new Error("Falta NEXT_PUBLIC_API_URL");

  const params = new URLSearchParams();
  if (datosContacto?.name) params.append("name", datosContacto.name);
  if (datosContacto?.phone) params.append("phone", datosContacto.phone);
  if (datosContacto?.addressLine1) params.append("addressLine1", datosContacto.addressLine1);
  const qs = params.toString();

  const res = await fetch(`${API}/loyalty/customer/${encodeURIComponent(dni)}${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error || "No se pudo consultar el saldo de puntos");
  }

  return body.data as LoyaltyCustomerStatus;
}

/** Preview (sin persistir) de cuántos puntos se ganarían con un monto de compra. */
export async function fetchLoyaltyEarnPreview(montoOrden: number): Promise<number> {
  if (!API) throw new Error("Falta NEXT_PUBLIC_API_URL");

  const res = await fetch(`${API}/loyalty/earn-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ montoOrden }),
    cache: "no-store",
  });

  const body = await res.json();
  if (!res.ok) return 0;
  return Number(body?.data?.puntosGanados ?? 0);
}
