"use client";

// components/runtime-provider.tsx
//
// change `infra-multi-tenant`, Fase 4 (tareas 4.2 y 4.4). Entrega a los componentes de navegador la configuración PÚBLICA del cliente
// de la visita (modo de tienda, reservas de mesa, clave de Maps, dirección de la app...). La alimenta `app/layout.tsx` (servidor) por
// Host, así el primer HTML y la hidratación coinciden: leer `window.__RUNTIME__` durante el render daría un valor en el servidor y otro
// en el navegador.
import { createContext, useContext, type ReactNode } from "react";
import type { PublicRuntime } from "@/lib/runtimeConfig";

/** Valores NEUTROS para un componente que se renderiza fuera del proveedor (nunca la marca de un cliente). */
const NEUTRAL: PublicRuntime = {
  name: "Pedidos online",
  brandColor: "#0077CC",
  logoUrl: null,
  wordmarkUrl: null,
  storeMode: "default",
  tableReservations: "off",
  currency: "ARS",
  currencySymbol: "$",
  apiBase: null,
  socketUrl: null,
  appUrl: "",
  vapidPublicKey: null,
  mapsPublicKey: null,
};

const RuntimeContext = createContext<PublicRuntime>(NEUTRAL);

export function RuntimeProvider({ value, children }: { value: PublicRuntime; children: ReactNode }) {
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

/** Configuración pública del cliente de esta visita. */
export function useRuntime(): PublicRuntime {
  return useContext(RuntimeContext);
}
