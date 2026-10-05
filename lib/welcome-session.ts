// Marca de "ya saludé" para el splash de bienvenida, por sesión del navegador
// (pestaña). Ver openspec/changes/welcome-splash-always.

const KEY = "pedilo_welcome_seen";

// Respaldo en memoria si sessionStorage no está disponible (modo privado, bloqueado).
// Evita repetir el splash en la navegación del lado del cliente; una recarga puede repetirlo.
let seenInMemory = false;

export function hasSeenWelcome(): boolean {
  if (seenInMemory) return true;
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markWelcomeSeen(): void {
  seenInMemory = true;
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    /* sin storage: queda solo la marca en memoria */
  }
}
