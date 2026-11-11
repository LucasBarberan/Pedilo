// Mensajes del backend que Pedilo puede mostrarle al cliente. Correr: npm run test:unit
import assert from "node:assert/strict";
import { test } from "node:test";
import { UserFacingError, businessErrorMessage } from "../lib/user-facing-error.ts";

test("un 422 de negocio devuelve el mensaje en español para mostrarle al cliente", () => {
  const body = JSON.stringify({ success: false, error: "Estos productos no están disponibles para ventas web: Sprite 500cc", code: "UNPROCESSABLE" });
  assert.equal(businessErrorMessage(422, body), "Estos productos no están disponibles para ventas web: Sprite 500cc");
});

test("también acepta el campo `message`", () => {
  assert.equal(businessErrorMessage(422, JSON.stringify({ message: "El combo \"X\" incluye productos no disponibles" })), "El combo \"X\" incluye productos no disponibles");
});

test("un 400 (validación técnica) NO se muestra al cliente", () => {
  assert.equal(businessErrorMessage(400, JSON.stringify({ error: "\"payments\" is not allowed" })), undefined);
});

test("un 500 o un 404 tampoco", () => {
  assert.equal(businessErrorMessage(500, JSON.stringify({ error: "Error de base de datos (P2010)." })), undefined);
  assert.equal(businessErrorMessage(404, JSON.stringify({ error: "No encontrado" })), undefined);
});

test("cuerpo que no es JSON, vacío o sin mensaje: undefined (aviso genérico)", () => {
  assert.equal(businessErrorMessage(422, "<html>Bad gateway</html>"), undefined);
  assert.equal(businessErrorMessage(422, ""), undefined);
  assert.equal(businessErrorMessage(422, JSON.stringify({ success: false })), undefined);
  assert.equal(businessErrorMessage(422, JSON.stringify({ error: "   " })), undefined);
  assert.equal(businessErrorMessage(422, JSON.stringify({ error: { detail: "x" } })), undefined);
});

test("UserFacingError es un Error con su mensaje, distinguible de un error común", () => {
  const e = new UserFacingError("Producto no disponible");
  assert.ok(e instanceof Error);
  assert.ok(e instanceof UserFacingError);
  assert.equal(e.message, "Producto no disponible");
  assert.ok(!(new Error("x") instanceof UserFacingError));
});
