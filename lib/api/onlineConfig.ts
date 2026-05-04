// lib/api/onlineConfig.ts

export type OnlineConfigResponse = {
  storeName: string;
  waNumber: string | null;
  deliveryEnabled: boolean;
  deliveryFee: number;
  closedMessage: string;
  pickupOnlyMsg: string;
  infoBannerEnabled: boolean;
  infoBannerMsg: string;
  infoBannerLevel: "info" | "warning" | "success";
};

export const ONLINE_CONFIG_DEFAULTS: OnlineConfigResponse = {
  storeName: "Mi Tienda",
  waNumber: null,
  deliveryEnabled: false,
  deliveryFee: 0,
  closedMessage: "⚠️ El local está cerrado en este momento.",
  pickupOnlyMsg: "El local está abierto, pero sólo tomamos pedidos en el local por ahora.",
  infoBannerEnabled: false,
  infoBannerMsg: "",
  infoBannerLevel: "info",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

let _cache: OnlineConfigResponse | null = null;
let _promise: Promise<OnlineConfigResponse> | null = null;

export async function fetchOnlineConfig(): Promise<OnlineConfigResponse> {
  if (_cache) return _cache;
  if (_promise) return _promise;

  _promise = (async () => {
    try {
      if (!API_URL) return ONLINE_CONFIG_DEFAULTS;
      const res = await fetch(`${API_URL}/business/online-config`, {
        cache: "no-store",
      });
      if (!res.ok) return ONLINE_CONFIG_DEFAULTS;
      const data: OnlineConfigResponse = await res.json();
      _cache = data;
      return data;
    } catch {
      return ONLINE_CONFIG_DEFAULTS;
    } finally {
      _promise = null;
    }
  })();

  return _promise;
}
