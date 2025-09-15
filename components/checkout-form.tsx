"use client";

import { useCart } from "@/components/cart-context";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";

type Customer = {
  name: string;
  phone: string;
  address: string;
};

type Props = {
  onCancel?: () => void;
  onSuccess?: () => void;
};

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

// ranking de tamaños: triple -> doble -> simple
const SIZE_RANK: Record<string, number> = { triple: 0, doble: 1, simple: 2 };

export default function CheckoutForm({ onCancel, onSuccess }: Props) {
  const { items, getTotalPrice, clearCart } = useCart();

  // ORDEN a usar en Resumen + WhatsApp
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      // 1) Categorías default primero
      const da = a.isDefaultCategory ? 0 : 1;
      const db = b.isDefaultCategory ? 0 : 1;
      if (da !== db) return da - db;

      // 2) Tamaño: triple -> doble -> simple (sin tamaño al final)
      const ra = SIZE_RANK[String(a.size || "").toLowerCase()] ?? 99;
      const rb = SIZE_RANK[String(b.size || "").toLowerCase()] ?? 99;
      if (ra !== rb) return ra - rb;

      // 3) Desempate por nombre
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [items]);

  const [customer, setCustomer] = useState<Customer>({
    name: "",
    phone: "",
    address: "",
  });

  const [deliveryMethod, setDeliveryMethod] =
    useState<"delivery" | "pickup">("delivery");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mp">("cash");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const total = useMemo(() => getTotalPrice(), [getTotalPrice]);

  // Cargar / guardar datos del cliente en localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("checkout.customer");
      if (raw) setCustomer(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("checkout.customer", JSON.stringify(customer));
    } catch {}
  }, [customer]);

  const BASE = process.env.NEXT_PUBLIC_API_URL;
  const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || "SRA. BURGA";

  /** 🔹 Arma el texto de WhatsApp (usa el mismo orden del resumen) */
  function buildWhatsAppText() {
    const lines: string[] = [];

    lines.push(`*${STORE_NAME} – Nuevo pedido*`);
    lines.push("");
    lines.push(`*Cliente:* ${customer.name}`);
    if (customer.phone?.trim()) lines.push(`*Tel:* ${customer.phone}`);
    if (deliveryMethod === "delivery" && customer.address?.trim()) {
      lines.push(`*Dirección:* ${customer.address}`);
    }
    lines.push(
      `*Entrega:* ${deliveryMethod === "delivery" ? "Delivery" : "Retiro"}`
    );
    lines.push(
      `*Pago:* ${paymentMethod === "cash" ? "Efectivo" : "Mercado Pago"}`
    );
    if (notes?.trim()) lines.push(`*Obs generales:* ${notes.trim()}`);
    lines.push("");
    lines.push("*Items:*");

    // 👇 usar el ordenamiento
    sortedItems.forEach((it) => {
      const unit = it.finalPrice / it.quantity || it.price;
      lines.push(
        `• ${it.quantity} x ${it.name}${
          it.size ? ` (tamaño: ${it.size})` : ""
        } – ${fmt(unit)} c/u`
      );
      if (it.observations?.trim()) {
        lines.push(`   Obs: ${it.observations.trim()}`);
      }
    });

    lines.push("");
    lines.push(`*Total:* ${fmt(total)}`);

    return lines.join("\n");
  }

  async function submitOrder() {
    if (!customer.name.trim() || !customer.phone.trim()) {
      alert("Completá al menos nombre y teléfono.");
      return;
    }
    if (items.length === 0) {
      alert("Tu carrito está vacío.");
      return;
    }

    setSubmitting(true);

    try {
      // 👉 Enviar al backend sólo si está habilitado por env
      const SEND_TO_API =
        (process.env.NEXT_PUBLIC_SEND_ORDERS || "").toLowerCase() === "true";

      if (SEND_TO_API) {
        if (!BASE) throw new Error("Falta NEXT_PUBLIC_API_URL");

        // 1) Armar items SIN 'options' y con 'option_ids' si aplica
        const itemsForApi = items.map((it) => {
          const unit = Math.round(
            (it.finalPrice || it.price * it.quantity) / it.quantity
          );
          const payload: any = {
            product_id: it.id,
            quantity: it.quantity,
            unit_price: unit,
          };
          if (it.observations?.trim())
            payload.comment = it.observations.trim();

          // Enviar ProductOption.id (lo que espera tu back)
          if (it.productOptionId) payload.option_ids = [Number(it.productOptionId)];

          return payload;
        });

        // 2) Body base
        const apiBodyRaw: any = {
          items: itemsForApi,
          payment_method:
            paymentMethod === "cash"
              ? "CASH"
              : paymentMethod === "mp"
              ? "MERCADOPAGO"
              : "CARD",
          amount_paid: Math.round(Number(total)),
        };

        // 3) Red de seguridad: eliminar cualquier 'options' en cualquier nivel
        const apiBody = JSON.parse(
          JSON.stringify(apiBodyRaw, (k, v) => (k === "options" ? undefined : v))
        );

        console.log("POST /orders body =>\n", JSON.stringify(apiBody, null, 2));

        // 4) Enviar
        const res = await fetch(`${BASE}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiBody),
        });

        const text = await res.text();
        if (!res.ok) {
          console.error("❌ POST /orders failed", res.status, text);
          alert(`No se pudo guardar el pedido (HTTP ${res.status}).\n${text}`);
          return; // no abrir WhatsApp si falló
        }
        console.log("✅ Orden creada:", text);
      }

      // 5) WhatsApp (si POST ok o desactivado)
      const businessPhone = process.env.NEXT_PUBLIC_WA_NUMBER || ""; // ej: 5491122334455
      const waText = encodeURIComponent(buildWhatsAppText());

      if (businessPhone) {
        const win = window.open("about:blank", "_blank");
        const url = `https://wa.me/${businessPhone}?text=${waText}`;
        if (win) win.location.href = url;
        else window.open(url, "_blank");
      } else {
        try {
          await navigator.clipboard.writeText(buildWhatsAppText());
          alert(
            "Configurá NEXT_PUBLIC_WA_NUMBER. El detalle del pedido fue copiado al portapapeles."
          );
        } catch {
          alert(
            "Configurá NEXT_PUBLIC_WA_NUMBER. Copiá y pegá este mensaje:\n\n" +
              buildWhatsAppText()
          );
        }
      }

      // 6) Limpiar carrito y cerrar
      clearCart();
      onSuccess?.();
    } catch (e) {
      console.error("❌ Error en submitOrder:", e);
      alert("Ocurrió un error al procesar el pedido. Revisá consola.");
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-6 text-center">
        Tu carrito está vacío.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Columna izquierda: Datos del cliente */}
      <div className="space-y-4">
        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
          <div className="text-sm font-semibold mb-3">Datos del cliente</div>

          <label className="block text-sm mb-1">Nombre y Apellido</label>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ea562f] mb-3"
            value={customer.name}
            onChange={(e) =>
              setCustomer({ ...customer, name: e.target.value })
            }
            placeholder="Tu nombre"
          />

          <label className="block text-sm mb-1">Teléfono</label>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ea562f] mb-3"
            value={customer.phone}
            onChange={(e) =>
              setCustomer({ ...customer, phone: e.target.value })
            }
            placeholder="Ej: 11 5555 5555"
          />

          <label className="block text-sm mb-1">Dirección</label>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ea562f]"
            value={customer.address}
            onChange={(e) =>
              setCustomer({ ...customer, address: e.target.value })
            }
            placeholder="Calle 123, Piso/Depto"
          />
        </div>

        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
          <div className="text-sm font-semibold mb-3">Entrega</div>
          <div className="flex gap-2">
            <button
              onClick={() => setDeliveryMethod("delivery")}
              className={`px-3 py-2 rounded-lg border ${
                deliveryMethod === "delivery"
                  ? "border-[#ea562f] bg-[#fff5f2]"
                  : "border-transparent hover:bg-black/5"
              }`}
            >
              Delivery
            </button>
            <button
              onClick={() => setDeliveryMethod("pickup")}
              className={`px-3 py-2 rounded-lg border ${
                deliveryMethod === "pickup"
                  ? "border-[#ea562f] bg-[#fff5f2]"
                  : "border-transparent hover:bg-black/5"
              }`}
            >
              Retiro
            </button>
          </div>
        </div>

        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
          <div className="text-sm font-semibold mb-3">Pago</div>
          <div className="flex gap-2">
            <button
              onClick={() => setPaymentMethod("cash")}
              className={`px-3 py-2 rounded-lg border ${
                paymentMethod === "cash"
                  ? "border-[#ea562f] bg-[#fff5f2]"
                  : "border-transparent hover:bg-black/5"
              }`}
            >
              Efectivo
            </button>
            <button
              onClick={() => setPaymentMethod("mp")}
              className={`px-3 py-2 rounded-lg border ${
                paymentMethod === "mp"
                  ? "border-[#ea562f] bg-[#fff5f2]"
                  : "border-transparent hover:bg-black/5"
              }`}
            >
              Mercado Pago
            </button>
          </div>
        </div>

        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
          <div className="text-sm font-semibold mb-2">Observaciones</div>
          <textarea
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ea562f]"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: timbre roto, sin cebolla, etc."
          />
        </div>
      </div>

      {/* Columna derecha: Resumen */}
      <div className="space-y-4">
        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
          <div className="text-sm font-semibold mb-3">Resumen</div>
          <div className="space-y-2">
            {sortedItems.map((it) => {   {/* 👈 usar sortedItems */}
              const unit = it.finalPrice / it.quantity || it.price;
              return (
                <div
                  key={it.uniqueId}
                  className="flex items-start justify-between"
                >
                  <div className="text-sm">
                    <div className="font-semibold">{it.name}</div>
                    <div className="text-muted-foreground">
                      {it.quantity} x {fmt(unit)}
                      {it.size ? ` · Tamaño: ${it.size}` : ""}
                    </div>
                    {it.observations?.trim() ? (
                      <div className="text-muted-foreground">
                        Obs: {it.observations.trim()}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-sm font-semibold">
                    {fmt(it.finalPrice || it.price * it.quantity)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t mt-3 pt-3">
            <div className="text-sm font-semibold">Total:</div>
            <div className="text-xl font-extrabold text-[#ea562f]">
              {fmt(total)}
            </div>
          </div>
        </div>

        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4 space-y-2">
          <Button className="w-full" onClick={submitOrder} disabled={submitting}>
            {submitting ? "Enviando..." : "Enviar Pedido"}
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
