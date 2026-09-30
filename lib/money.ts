/**
 * Formato de importes de Pedilo: sin decimales si el importe es entero, con exactamente dos si hay centavos
 * ($10.000 / $2.187,50). `toLocaleString("es-AR")` a secas mostraba un solo decimal ($2.187,5).
 */
export function formatMoney(n: number, sym = "$"): string {
  const value = Number(n) || 0;
  const isInt = Math.round(value * 100) % 100 === 0;
  const digits = isInt ? 0 : 2;
  return `${sym}${value.toLocaleString("es-AR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
