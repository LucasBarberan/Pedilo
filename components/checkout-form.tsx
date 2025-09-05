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

export default function CheckoutForm({ onCancel, onSuccess }: Props) {
  const { items, getTotalPrice, clearCart } = useCart();

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

  /** 🔹 Arma el texto de WhatsApp (incluye tamaño + observaciones) */
  function buildWhatsAppText() {
    const lines: string[] = [];

    // Encabezado con nombre de la tienda
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

    items.forEach((it) => {
      const unit = it.finalPrice / it.quantity || it.price;
      lines.push(
        `• ${it.quantity} x ${it.name}${it.size ? ` (tamaño: ${it.size})` : ""} – ${fmt(
          unit
        )} c/u`
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

    // payload por si querés guardarlo cuando tengas backend
    const payload = {
      createdAt: new Date().toISOString(),
      customer,
      deliveryMethod,
      paymentMethod,
      notes,
      total,
      items: items.map((it) => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        unitPrice: it.finalPrice / it.quantity || it.price,
        finalPrice: it.finalPrice,
        size: it.size,
        image: it.image,
        observations: it.observations ?? "",
      })),
      status: "pending",
    };

    // 1) WhatsApp (siempre)
    const businessPhone = process.env.NEXT_PUBLIC_WA_NUMBER || ""; // ej: 5491122334455
    const waText = encodeURIComponent(buildWhatsAppText());

    if (businessPhone) {
      // tip anti-bloqueador: abrimos primero y luego seteamos href
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

    // 2) (Opcional) Enviar al backend cuando esté listo
    const SEND_TO_API =
      (process.env.NEXT_PUBLIC_SEND_ORDERS || "").toLowerCase() === "true"; // por defecto false

    if (SEND_TO_API) {
      try {
        const base = BASE; // tu backend real
        if (!base) throw new Error("Falta NEXT_PUBLIC_API_URL");
        await fetch(`${base}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        // Si falla, no frenamos: WhatsApp ya salió
      } catch (e) {
        console.warn(
          "No se pudo enviar al backend (ignorado hasta que esté listo):",
          e
        );
      }
    }

    // 3) Limpiar carrito y cerrar
    clearCart();
    onSuccess?.();
    setSubmitting(false);
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
            {items.map((it) => {
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
                    {/* Observaciones del ítem si hay */}
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
          {/* Un solo botón hace POST (opcional) + WhatsApp */}
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
