// lib/storeMode.ts
// Modo de catálogo/checkout del negocio, configurado por deployment (.env),
// independiente de NEXT_PUBLIC_TABLE_RESERVATIONS (ver lib/tableReservations.ts).

export function isWholesaleMode(): boolean {
  return process.env.NEXT_PUBLIC_STORE_MODE === "wholesale";
}
