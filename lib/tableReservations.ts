// lib/tableReservations.ts
// Gatea, por sí sola, la existencia de la pantalla de entrada (EntryScreen) — no depende del modo de tienda (ver lib/storeMode.ts): no
// todo negocio wholesale reserva mesas, y viceversa.
//
// change `infra-multi-tenant`, Fase 4 (tarea 4.4): el valor sale de la configuración del cliente de la visita, no de `process.env`.

export type TableReservationsMode = "off" | "on" | "coming_soon";

export function getTableReservationsMode(runtime: { tableReservations: string }): TableReservationsMode {
  const value = runtime.tableReservations;
  if (value === "on" || value === "coming_soon") return value;
  return "off";
}
