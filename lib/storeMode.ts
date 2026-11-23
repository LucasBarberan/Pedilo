// lib/storeMode.ts
// Modo de catálogo/checkout del negocio, independiente de las reservas de mesa (ver lib/tableReservations.ts).
//
// change `infra-multi-tenant`, Fase 4 (tarea 4.4): ya NO se lee de `process.env` (se congelaba en el build de cada cliente). El valor
// sale de la configuración del cliente de la visita (`useRuntime()` en el navegador, `getRuntimeConfig()` en el servidor).

export function isWholesaleMode(runtime: { storeMode: string }): boolean {
  return runtime.storeMode === "wholesale";
}
