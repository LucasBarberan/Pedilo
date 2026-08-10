// lib/tableReservations.ts
// Gatea, por sí sola, la existencia de la pantalla de entrada (EntryScreen) —
// no depende de NEXT_PUBLIC_STORE_MODE (ver lib/storeMode.ts): no todo negocio
// wholesale reserva mesas, y viceversa.

export type TableReservationsMode = "off" | "on" | "coming_soon";

export function getTableReservationsMode(): TableReservationsMode {
  const value = process.env.NEXT_PUBLIC_TABLE_RESERVATIONS;
  if (value === "on" || value === "coming_soon") return value;
  return "off";
}
