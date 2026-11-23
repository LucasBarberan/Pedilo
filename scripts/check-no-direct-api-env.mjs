// Regla de la Fase 4 de infra-multi-tenant (tareas 4.3 y 4.4): las variables NEXT_PUBLIC_* POR CLIENTE solo se pueden leer en los dos
// archivos que resuelven la configuración. Cualquier otro uso queda congelado en el build y rompe la imagen única para todos los
// clientes. Pedilo no tiene configuración de ESLint, así que la regla vive acá. Correr: npm run check:api-env
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PERMITIDOS = new Set(["lib/apiBase.client.ts", "lib/runtimeConfig.ts"]);
// Variables que ya se resuelven por cliente (config de la visita) y NO deben volver a leerse del entorno del build.
const VARIABLES = [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_SOCKET_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_STORE_MODE",
  "NEXT_PUBLIC_TABLE_RESERVATIONS",
  "NEXT_PUBLIC_BRAND_COLOR",
  "NEXT_PUBLIC_STORE_NAME",
  "NEXT_PUBLIC_STORE_DESCRIPTION",
  "NEXT_PUBLIC_GOOGLE_MAPS_PLACES_API_KEY",
];
const ALT = VARIABLES.join("|");
const PATRON = new RegExp(`process\.env\.(${ALT})\b|process\.env\[\s*["'](${ALT})["']\s*\]`);
const CARPETAS = ["app", "components", "lib", "hooks", "middleware.ts"];
const SALTAR = new Set(["node_modules", ".next", ".next-pricing-test"]);

function* archivos(ruta) {
  const st = statSync(ruta);
  if (st.isFile()) {
    if (/\.(ts|tsx|js|jsx|mjs)$/.test(ruta)) yield ruta;
    return;
  }
  for (const nombre of readdirSync(ruta)) {
    if (SALTAR.has(nombre)) continue;
    yield* archivos(join(ruta, nombre));
  }
}

const infracciones = [];
for (const carpeta of CARPETAS) {
  const ruta = join(ROOT, carpeta);
  try {
    statSync(ruta);
  } catch {
    continue;
  }
  for (const f of archivos(ruta)) {
    const rel = relative(ROOT, f).split(sep).join("/");
    if (PERMITIDOS.has(rel)) continue;
    readFileSync(f, "utf8").split(/\r?\n/).forEach((linea, i) => {
      // Los comentarios que NOMBRAN la variable no son lecturas.
      if (/^\s*(\/\/|\*|\/\*)/.test(linea)) return;
      if (PATRON.test(linea)) infracciones.push(`${rel}:${i + 1}: ${linea.trim()}`);
    });
  }
}

if (infracciones.length) {
  console.error("❌ Lectura directa de una variable por cliente fuera de lib/apiBase.client.ts y lib/runtimeConfig.ts:\n" + infracciones.map((x) => "   " + x).join("\n"));
  console.error("\nUsá `runtimeApiBase()` (librerías), `useRuntime()` (componentes) o `await getRuntimeConfig()` / `await apiBase()` (servidor).");
  process.exit(1);
}
console.log("✅ Ninguna lectura directa de variables por cliente fuera de los helpers.");
