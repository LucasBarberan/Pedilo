// lib/api/paymentMethods.ts

export type PublicPaymentMethod = {
  id: number;
  code: string;
  name: string;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  /** % descuento/recargo — mutuamente excluyentes. Solo para previsualizar en
   * el checkout (nunca se re-cotiza en vivo); el monto final autoritativo lo
   * calcula el Backend al confirmar el pedido. */
  discountPercent: number;
  surchargePercent: number;
};

const API = process.env.NEXT_PUBLIC_API_URL; // ej: http://localhost:5000/api

let _cache: PublicPaymentMethod[] | null = null;
let _promise: Promise<PublicPaymentMethod[]> | null = null;

/**
 * Medios de pago visibles en Pedilo (canal WEB), configurados desde el admin
 * (`admin/tesoreria/metodos-de-pago`, campo "Visible en App Online"). Caché
 * singleton por carga de página — mismo patrón que `fetchOnlineConfig`/
 * `loadDeliveryConfig` (lib/api/onlineConfig.ts, lib/api/delivery.ts): se
 * pide una sola vez y se reutiliza, sin invalidación mid-sesión (un cambio
 * del admin se ve recién en el próximo refresh completo, igual que
 * delivery/loyalty/online-config hoy).
 *
 * `SiteHeader` (montado en todas las pantallas previas al checkout) dispara
 * esta llamada apenas se renderiza, para que el caché ya esté tibio cuando
 * `checkout-form.tsx` lo pide — evita un "refetch" visible recién al llegar
 * al paso de pago.
 *
 * Lista vacía (por error de red, `NEXT_PUBLIC_API_URL` faltante, o
 * `DELIVERY` deshabilitado del lado del Backend) nunca lanza — el checkout
 * decide qué mostrar ante `[]` (ver checkout-form.tsx).
 */
export async function fetchPublicPaymentMethods(): Promise<PublicPaymentMethod[]> {
  if (_cache) return _cache;
  if (_promise) return _promise;

  _promise = (async () => {
    try {
      if (!API) return [];
      const res = await fetch(`${API}/public/payment-methods`, { cache: "no-store" });
      if (!res.ok) return [];
      const body = await res.json();
      const data = Array.isArray(body?.data) ? body.data : [];
      _cache = data;
      return data;
    } catch {
      return [];
    } finally {
      _promise = null;
    }
  })();

  return _promise;
}
