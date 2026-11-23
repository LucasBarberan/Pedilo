// Cargador de configuración por cliente (change infra-multi-tenant, Fase 4, tareas 4.1 y 4.6). Correr: npm run test:unit
// Sin red ni Next: el Backend se reemplaza por un `fetch` de doble.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRuntimeConfigLoader,
  NEUTRAL_BRAND_COLOR,
  NEUTRAL_RUNTIME_CONFIG,
  parseRuntimeConfig,
  safeJsonForScript,
} from "../lib/runtimeConfigLoader.ts";

const cfg = (name, color, extra = {}) => ({
  name,
  description: `Descripción de ${name}`,
  brandColor: color,
  logoUrl: null,
  faviconUrl: null,
  storeMode: "default",
  tableReservations: "off",
  currency: "ARS",
  currencySymbol: "$",
  apiBase: `https://api.${name}.example.test/api`,
  socketUrl: `https://api.${name}.example.test`,
  appUrl: `https://${name}.example.test`,
  vapidPublicKey: null,
  mapsPublicKey: null,
  ...extra,
});

/** Backend de doble: responde según el Host y cuenta las consultas. */
function fakeBackend(table) {
  const calls = [];
  const state = { down: false };
  const fetchImpl = async (url, init) => {
    const host = init.headers["X-Keltron-Host"];
    calls.push({ url, host, key: init.headers["X-Internal-Key"] });
    if (state.down) throw new Error("ECONNREFUSED");
    const entry = table[host];
    if (!entry) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(entry), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, calls, state };
}

const make = (table, extra = {}) => {
  const be = fakeBackend(table);
  const clock = { t: 1_000_000 };
  const loader = createRuntimeConfigLoader({
    backendUrl: "http://backend:5000/api/",
    internalKey: "clave-interna-de-prueba",
    fetchImpl: be.fetchImpl,
    now: () => clock.t,
    ...extra,
  });
  return { loader, be, clock };
};

test("dos clientes, misma imagen: cada dominio recibe SOLO su marca", async () => {
  const { loader } = make({ "t01.example.test": cfg("t01", "#112233"), "t02.example.test": cfg("t02", "#AABBCC") });
  const a = await loader.load("t01.example.test");
  const b = await loader.load("t02.example.test");
  assert.equal(a.brandColor, "#112233");
  assert.equal(a.name, "t01");
  assert.equal(b.brandColor, "#AABBCC");
  assert.equal(b.name, "t02");
});

test("consulta al Backend con X-Keltron-Host y la clave interna, sobre la base sin barra final", async () => {
  const { loader, be } = make({ "t01.example.test": cfg("t01", "#112233") });
  await loader.load("T01.Example.Test");
  assert.equal(be.calls.length, 1);
  assert.equal(be.calls[0].url, "http://backend:5000/api/public/tenant-config");
  assert.equal(be.calls[0].host, "t01.example.test");
  assert.equal(be.calls[0].key, "clave-interna-de-prueba");
});

test("la caché es por Host: alternar dominios nunca sirve la marca del otro", async () => {
  const { loader, be } = make({ "t01.example.test": cfg("t01", "#112233"), "t02.example.test": cfg("t02", "#AABBCC") });
  for (let i = 0; i < 5; i++) {
    assert.equal((await loader.load("t01.example.test")).brandColor, "#112233");
    assert.equal((await loader.load("t02.example.test")).brandColor, "#AABBCC");
  }
  assert.equal(be.calls.length, 2, "una consulta por dominio dentro de la vigencia");
});

test("vencida la vigencia (60 s) vuelve a consultar y toma el cambio del cliente", async () => {
  const table = { "t01.example.test": cfg("t01", "#112233") };
  const { loader, be, clock } = make(table);
  await loader.load("t01.example.test");
  clock.t += 59_000;
  await loader.load("t01.example.test");
  assert.equal(be.calls.length, 1);
  table["t01.example.test"] = cfg("t01", "#445566");
  clock.t += 2_000;
  assert.equal((await loader.load("t01.example.test")).brandColor, "#445566");
  assert.equal(be.calls.length, 2);
});

test("Backend caído: sirve el ÚLTIMO valor bueno de ESE dominio, no el de otro", async () => {
  const { loader, be, clock } = make({ "t01.example.test": cfg("t01", "#112233"), "t02.example.test": cfg("t02", "#AABBCC") });
  await loader.load("t01.example.test");
  await loader.load("t02.example.test");
  be.state.down = true;
  clock.t += 120_000;
  assert.equal((await loader.load("t01.example.test")).brandColor, "#112233");
  assert.equal((await loader.load("t02.example.test")).brandColor, "#AABBCC");
});

test("Backend caído desde el arranque: configuración NEUTRA, sin marca de ningún cliente", async () => {
  const errors = [];
  const { loader, be } = make({ "t01.example.test": cfg("t01", "#112233") }, { onError: (h, e) => errors.push([h, String(e)]) });
  be.state.down = true;
  const c = await loader.load("t01.example.test");
  assert.deepEqual(c, NEUTRAL_RUNTIME_CONFIG);
  assert.equal(c.brandColor, NEUTRAL_BRAND_COLOR);
  assert.equal(errors.length, 1);
});

test("tras una falla no martilla al Backend: reintenta recién pasados 30 s", async () => {
  const { loader, be, clock } = make({ "t01.example.test": cfg("t01", "#112233") });
  be.state.down = true;
  await loader.load("t01.example.test");
  await loader.load("t01.example.test");
  await loader.load("t01.example.test");
  assert.equal(be.calls.length, 1);
  clock.t += 31_000;
  be.state.down = false;
  assert.equal((await loader.load("t01.example.test")).brandColor, "#112233");
  assert.equal(be.calls.length, 2);
});

test("un dominio que el Backend rechaza (404) es neutro y se recuerda por poco tiempo", async () => {
  const { loader, be, clock } = make({});
  assert.deepEqual(await loader.load("desconocido.example.test"), NEUTRAL_RUNTIME_CONFIG);
  await loader.load("desconocido.example.test");
  assert.equal(be.calls.length, 1, "no repite la consulta dentro de la ventana negativa");
  clock.t += 31_000;
  await loader.load("desconocido.example.test");
  assert.equal(be.calls.length, 2);
});

test("un dominio que dejó de existir NO conserva su marca vieja", async () => {
  const table = { "t01.example.test": cfg("t01", "#112233") };
  const { loader, clock } = make(table);
  assert.equal((await loader.load("t01.example.test")).brandColor, "#112233");
  delete table["t01.example.test"];
  clock.t += 61_000;
  assert.deepEqual(await loader.load("t01.example.test"), NEUTRAL_RUNTIME_CONFIG);
});

test("mil visitas simultáneas a un dominio son UNA consulta", async () => {
  const { loader, be } = make({ "t01.example.test": cfg("t01", "#112233") });
  await Promise.all(Array.from({ length: 1000 }, () => loader.load("t01.example.test")));
  assert.equal(be.calls.length, 1);
});

test("un barrido de Hosts inventados no hace crecer la memoria sin límite", async () => {
  const { loader } = make({}, { maxEntries: 50 });
  for (let i = 0; i < 500; i++) await loader.load(`inventado-${i}.example.test`);
  assert.ok(loader.size() <= 50, `quedaron ${loader.size()} entradas`);
});

test("Host vacío es neutro y no consulta", async () => {
  const { loader, be } = make({});
  assert.deepEqual(await loader.load("  "), NEUTRAL_RUNTIME_CONFIG);
  assert.equal(be.calls.length, 0);
});

test("una respuesta inválida del Backend no llega al HTML: color y modos caen a lo neutro", () => {
  const c = parseRuntimeConfig({ name: "X", brandColor: "red;} body{display:none", storeMode: "otro", tableReservations: "tal vez" });
  assert.equal(c.brandColor, NEUTRAL_BRAND_COLOR);
  assert.equal(c.storeMode, "default");
  assert.equal(c.tableReservations, "off");
  assert.equal(parseRuntimeConfig({ brandColor: "#112233" }), null, "sin nombre no es una configuración válida");
  assert.equal(parseRuntimeConfig(null), null);
});

test("normaliza el color a mayúsculas y quita la barra final de las direcciones", () => {
  const c = parseRuntimeConfig(cfg("t01", "#aabbcc", { apiBase: "https://api.t01.example.test/api///" }));
  assert.equal(c.brandColor, "#AABBCC");
  assert.equal(c.apiBase, "https://api.t01.example.test/api");
});

test("el JSON para <script> no puede cerrar la etiqueta ni romper por separadores de línea", () => {
  const out = safeJsonForScript({ name: "</script><script>alert(1)</script>", x: " " });
  assert.ok(!out.includes("</script>"));
  assert.ok(!out.includes("<"));
  assert.ok(!out.includes(" "));
  assert.equal(JSON.parse(out).name, "</script><script>alert(1)</script>");
});
