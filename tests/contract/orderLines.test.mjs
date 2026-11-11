// Contrato único de órdenes — Pedilo produce los golden payloads del Backend (Backend/docs/order-contract).
// Correr: npm run test:contract   (Node 22: usa --experimental-strip-types para importar el .ts del serializador)
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOrderLines, buildQuoteRequest, buildOrderRequest, buildTableCommandRequest, completeComboSlots } from "../../lib/orderLines.ts";

const GOLDEN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "golden");
const hashOf = (text) => crypto.createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
const manifest = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, "manifest.json"), "utf8"));
const golden = (id) => JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, `${id}.json`), "utf8"));

const ids = new Map();
const idOf = (token) => {
  if (!ids.has(token)) ids.set(token, 1000 + ids.size * 7);
  return ids.get(token);
};
const resolve = (v) => {
  if (typeof v === "string" && v.startsWith("$")) return idOf(v);
  if (Array.isArray(v)) return v.map(resolve);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]));
  return v;
};

// ─── Carritos de Pedilo (la forma real de cart-context.tsx) ─────────────────────────────────────────────────────────
const product = (token, quantity = 1, extra = {}) => ({ uniqueId: `p-${token}`, id: idOf(`$product:${token}`), name: token, quantity, ...extra });
const selected = (list) => list.map((o) => ({ productOptionId: idOf(`$option:${o.token}`), optionId: idOf(`$option:${o.token}`), optionName: o.token, tipo: "", priceExtra: 0, qty: o.qty ?? 1 }));
const slotItem = (combo, itemIndex, slotIndex, opts = [], comment) => ({
  productId: 1,
  name: "x",
  qty: 1,
  comboItemId: idOf(`$comboItem:${combo}:${itemIndex}`),
  slotIndex,
  optionIds: opts.map((o) => idOf(`$option:${o.token}`)),
  options: opts.map((o) => ({ id: idOf(`$option:${o.token}`), qty: o.qty ?? 1 })),
  ...(comment ? { comment } : {}),
});
const combo = (token, comboItems, extra = {}) => ({ uniqueId: `c-${token}`, id: idOf(`$combo:${token}`), name: token, quantity: 1, kind: "combo", comboItems, ...extra });
const comboCla = () => combo("COMBO-CLA", [slotItem("COMBO-CLA", 0, 0), slotItem("COMBO-CLA", 1, 0), slotItem("COMBO-CLA", 2, 0)]);

test("la copia local de los golden coincide con el manifiesto del Backend (si no: npm run sync:contract)", () => {
  for (const [name, expected] of Object.entries(manifest.files)) {
    assert.equal(hashOf(fs.readFileSync(path.join(GOLDEN_DIR, name), "utf8")), expected, name);
  }
});

const LINES_CASES = {
  "01-producto-simple": () => [product("HAM-CLA")],
  "02-producto-modificadores-cantidad": () => [product("HAM-CLA", 2, { observations: "sin cebolla", selectedOptions: selected([{ token: "DOBLE" }]) })],
  "04-combo-slots-cantidad-1": () => [comboCla()],
  "05-combo-cantidad-2-modificadores-distintos": () => [
    combo("AC-MAIN2", [
      slotItem("AC-MAIN2", 0, 0, [{ token: "SIMPLE" }], "sin mayonesa"),
      slotItem("AC-MAIN2", 0, 1, [{ token: "DOBLE" }]),
      slotItem("AC-MAIN2", 1, 0),
    ]),
  ],
  "06-combo-eleccion-por-categoria": () => [
    combo("COMBO-SLOT", [
      slotItem("COMBO-SLOT", 0, 0),
      slotItem("COMBO-SLOT", 1, 0),
      { productId: idOf("$product:GAS"), name: "gas", qty: 1, isInclusion: true, inclusionId: idOf("$inclusion:COMBO-SLOT") },
    ]),
  ],
};

for (const [id, cart] of Object.entries(LINES_CASES)) {
  test(`${id}: las lines[] son las del golden`, () => {
    const expected = resolve(golden(id).request.lines);
    assert.deepEqual(buildOrderLines(cart()), expected);
  });
}

test("10-cotizacion: las MISMAS lines[] + payments[] sin monto", () => {
  const g = resolve(golden("10-cotizacion").request);
  assert.deepEqual(buildQuoteRequest({ lines: buildOrderLines([product("HAM-CLA")]), channel: "POS", paymentMethodId: idOf("$payment:CASH") }), g);
});

test("12-comanda-de-mesa: lines[] sin pago", () => {
  const g = resolve(golden("12-comanda-de-mesa").request);
  const body = buildTableCommandRequest({ lines: buildOrderLines([product("HAM-CLA"), comboCla()]), clientRequestId: "id", guestName: "Ana" });
  assert.deepEqual(body.lines, g.lines);
  assert.equal("payments" in body, false);
});

test("11-orden-con-entrega (canal WEB): lines[] + payments[] por el total cotizado + entrega", () => {
  const g = resolve(golden("11-orden-con-entrega").request);
  const body = buildOrderRequest({
    lines: buildOrderLines([product("HAM-CLA")]),
    paymentMethodId: idOf("$payment:DEBIT"),
    total: 10000,
    fulfillment: "DELIVERY",
    deliveryInfo: g.delivery_info,
  });
  assert.deepEqual(body.lines, g.lines);
  assert.deepEqual(body.payments, g.payments);
  assert.equal(body.channel, "WEB");
  for (const legacy of ["items", "combos", "paymentMethodId", "amount_paid"]) assert.equal(legacy in body, false, legacy);
});

test("un combo sin slots no se serializa (en lugar de perder la línea en silencio)", () => {
  assert.throws(() => buildOrderLines([combo("X", [{ productId: 1, name: "a", qty: 1, isMain: true }])]), /no tiene slots/);
});

test("completeComboSlots: un slot por unidad de cada ítem; los fijos van sin opciones", () => {
  const slots = completeComboSlots(
    [{ comboItemId: 1, slotIndex: 0 }, { comboItemId: 1, slotIndex: 1 }, { comboItemId: 2, slotIndex: 0 }],
    [{ comboItemId: 1, slotIndex: 1, options: [{ id: 9, qty: 2 }], comment: " sin sal " }]
  );
  assert.deepEqual(slots, [
    { combo_item_id: 1, slot_index: 0 },
    { combo_item_id: 1, slot_index: 1, options: [{ id: 9, qty: 2 }], comment: "sin sal" },
    { combo_item_id: 2, slot_index: 0 },
  ]);
});
