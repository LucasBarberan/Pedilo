/**
 * Error cuyo mensaje SÍ se puede mostrar tal cual al cliente (está en español y explica qué pasó).
 * El resto de los errores del checkout (red, 500, validaciones técnicas) siguen mostrando un aviso genérico:
 * nunca se le muestra al cliente un mensaje técnico del servidor.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * Mensaje de un error de NEGOCIO del backend (HTTP 422, ej. "Estos productos no están disponibles para ventas web: X").
 * Devuelve undefined para cualquier otra respuesta: los 400 traen mensajes de validación técnicos y los 5xx no son para el cliente.
 */
export function businessErrorMessage(status: number, bodyText: string): string | undefined {
  if (status !== 422) return undefined;
  try {
    const parsed = JSON.parse(bodyText);
    const msg = parsed?.error ?? parsed?.message;
    return typeof msg === "string" && msg.trim() ? msg.trim() : undefined;
  } catch {
    return undefined;
  }
}
