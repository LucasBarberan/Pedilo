#!/usr/bin/env node
/**
 * Copia los golden payloads del contrato único de órdenes desde el Backend (su dueño) a `tests/contract/golden/` y verifica el manifiesto.
 *
 * El Backend define el contrato (`Backend/docs/order-contract/golden/*.json` + `manifest.json` con el sha256 de cada archivo). Este repo guarda una copia
 * para que sus tests de contrato (`tests/contract/orderLines.test.mjs`) corran sin el Backend; el mismo test verifica que la copia coincida con el
 * manifiesto, así que un golden desactualizado hace fallar el test en lugar de pasar en silencio.
 *
 * Uso (desde Pedilo/):
 *   npm run sync:contract                 # copia desde ../Backend/docs/order-contract y verifica
 *   KELTRON_BACKEND_PATH=/ruta/Backend npm run sync:contract
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = process.env.KELTRON_BACKEND_PATH ?? path.resolve(here, "..", "..", "Backend");
const sourceDir = path.join(backend, "docs", "order-contract");
const targetDir = path.resolve(here, "..", "tests", "contract", "golden");

const hashOf = (text) => crypto.createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");

if (!fs.existsSync(path.join(sourceDir, "manifest.json"))) {
  console.error(`No se encontró el contrato en "${sourceDir}". Si el Backend no es carpeta hermana, definí KELTRON_BACKEND_PATH.`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, "manifest.json"), "utf8"));
fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });

const problems = [];
for (const [name, expected] of Object.entries(manifest.files)) {
  const content = fs.readFileSync(path.join(sourceDir, "golden", name), "utf8").replace(/\r\n/g, "\n");
  if (hashOf(content) !== expected) problems.push(`${name}: el hash no coincide con el manifiesto del Backend`);
  fs.writeFileSync(path.join(targetDir, name), content, "utf8");
}
fs.writeFileSync(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

if (problems.length) {
  console.error("Los golden del Backend no coinciden con su propio manifiesto:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log(`Golden payloads sincronizados: ${Object.keys(manifest.files).length} archivos en tests/contract/golden/`);
