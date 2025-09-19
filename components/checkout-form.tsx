// components/checkout-form.tsx
"use client";

import { useCart,CartComboItem  } from "@/components/cart-context";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { STORE_OPEN, STORE_CLOSED_MSG } from "@/lib/flags";

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

// Tipo auxiliar para reconocer combos sin romper tipos existentes
type MaybeCombo = {
  kind?: string;
  comboItems?: Array<{
    productId?: number;
    isMain?: boolean;
    qty?: number;
    name?: string;
  }>;
  optionName?: string; // alias de size si lo preferís
};

export default function CheckoutForm({ onCancel, onSuccess }: Props) {
  const { items, getTotalPrice, clearCart } = useCart();

  // ORDEN a usar en Resumen + WhatsApp (considera size u optionName)
  const sortedItems = useMemo(() => {
    return [...items].sort((a: any, b: any) => {
      // 1) Categorías default primero
      const da = a.isDefaultCategory ? 0 : 1;
      const db = b.isDefaultCategory ? 0 : 1;
      if (da !== db) return da - db;

      // 2) Tamaño: triple -> doble -> simple (sin tamaño al final)
      const sa = String((a.size || (a as MaybeCombo).optionName || "")).toLowerCase();
      const sb = String((b.size || (b as MaybeCombo).optionName || "")).toLowerCase();
      const ra = SIZE_RANK[sa] ?? 99;
      const rb = SIZE_RANK[sb] ?? 99;
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
  function buildWhatsAppText(orderNumber?: number | string) {
    const lines: string[] = [];

    const headerSuffix = orderNumber ? ` – Pedido #${orderNumber}` : "";
    lines.push(`*${STORE_NAME}${headerSuffix}*`);
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

    // 👇 usar el ordenamiento y desglosar combos
    sortedItems.forEach((it: any) => {
      const unit = it.finalPrice / it.quantity || it.price;
      const comboData = it as MaybeCombo;
      const isCombo =
        comboData.kind === "combo" || Array.isArray(comboData.comboItems);

      const sizeLabel =
        (it.size as string) ||
        (comboData.optionName as string) ||
        undefined;

      if (!isCombo) {
        lines.push(
          `• ${it.quantity} x ${it.name}${
            sizeLabel ? ` (tamaño: ${sizeLabel})` : ""
          } – ${fmt(unit)} c/u`
        );
        if (it.observations?.trim()) {
          lines.push(`   Obs: ${it.observations.trim()}`);
        }
      } else {
        lines.push(
          `• ${it.quantity} x ${it.name} – ${fmt(unit)} c/u`
        );
        if (it.observations?.trim()) {
          lines.push(`   Obs: ${it.observations.trim()}`);
        }

        const main = comboData.comboItems?.find((x) => x.isMain);
        const extras = comboData.comboItems?.filter((x) => !x.isMain) || [];

        if (main) {
          lines.push(
            `   · Principal: ${main.name || "Producto"}${
              sizeLabel ? ` (tamaño: ${sizeLabel})` : ""
            }${main.qty && main.qty > 1 ? ` x${main.qty}` : ""}`
          );
        }
        if (extras.length > 0) {
          lines.push(`   · Incluye:`);
          extras.forEach((e) => {
            lines.push(
              `     - ${e.name || "Ítem"}${e.qty && e.qty > 1 ? ` x${e.qty}` : ""}`
            );
          });
        }
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
  // si es delivery, pedimos dirección
  if (deliveryMethod === "delivery" && !customer.address.trim()) {
    alert("Ingresá la dirección para el delivery.");
    return;
  }

  setSubmitting(true);

  try {
    const SEND_TO_API =
      (process.env.NEXT_PUBLIC_SEND_ORDERS || "").toLowerCase() === "true";

    let createdOrderNumber: number | string | undefined;

    if (SEND_TO_API) {
      if (!BASE) throw new Error("Falta NEXT_PUBLIC_API_URL");

      const itemsForApi: any[] = [];
      const combosForApi: any[] = [];

      for (const it of items) {
        if (it.kind === "combo") {
          // precio unitario del combo (el back prorratea internamente)
          const unitCombo = Math.round(Number(it.price));

          combosForApi.push({
            combo_id: Number(it.id),
            name: it.comboName || it.name,
            quantity: Number(it.quantity),
            unit_price: unitCombo,
            comment: it.observations?.trim() || null,
            items: (it.comboItems || []).map((ci: any) => ({
              product_id: Number(ci.productId),
              quantity: Number(ci.qty) || 1,
              ...(ci.option?.id ? { option_ids: [Number(ci.option.id)] } : {}),
            })),
          });
        } else {
          // producto normal
          const unit = Math.round(
            (Number(it.finalPrice) || Number(it.price) * Number(it.quantity)) /
              Number(it.quantity)
          );
          const payload: any = {
            product_id: Number(it.id),
            quantity: Number(it.quantity),
            unit_price: unit,
          };
          if (it.observations?.trim()) payload.comment = it.observations.trim();
          if (it.productOptionId) payload.option_ids = [Number(it.productOptionId)];
          itemsForApi.push(payload);
        }
      }

      // 4) Delivery info (siempre provider WEB)
      const delivery_info =
        deliveryMethod === "delivery"
          ? {
              customerName: customer.name.trim(),
              customerPhone: customer.phone.trim(),
              addressText: customer.address.trim(),
              notes: notes?.trim() || null,
              scheduledAt: null,
              provider: "WEB",
              mapUrl: null,
            }
          : {
              customerName: customer.name.trim(),
              customerPhone: customer.phone.trim(),
              addressText: "", // vacío en retiro
              notes: notes?.trim() || null,
              scheduledAt: null,
              provider: "WEB",
              mapUrl: null,
            };

      // body
      const apiBodyRaw: any = {
        items: itemsForApi,
        combos: combosForApi,
        payment_method:
          paymentMethod === "cash"
            ? "CASH"
            : paymentMethod === "mp"
            ? "MERCADOPAGO"
            : "CARD",
        amount_paid: Math.round(Number(total)),
        delivery_info,
      };

      // limpieza defensiva (sin 'options' y sin undefined)
      const apiBody = JSON.parse(
        JSON.stringify(apiBodyRaw, (k, v) =>
          k === "options" || v === undefined ? undefined : v
        )
      );

      console.log("POST /orders body =>\n", JSON.stringify(apiBody, null, 2));

      const res = await fetch(`${BASE}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiBody),
      });

      const text = await res.text();
      if (!res.ok) {
        console.error("❌ POST /orders failed", res.status, text);
        alert(`No se pudo guardar el pedido (HTTP ${res.status}).\n${text}`);
        return;
      }
      console.log("✅ Orden creada:", text);

      // intentar extraer el número de pedido para WhatsApp
      try {
        const parsed = JSON.parse(text);
        createdOrderNumber =
          parsed?.data?.orderNumber ??
          parsed?.orderNumber ??
          parsed?.data?.order?.orderNumber ??
          undefined;
      } catch {
        // si no es JSON, dejamos undefined
      }
    }

    // WhatsApp (con número si lo tenemos)
      const businessPhone = process.env.NEXT_PUBLIC_WA_NUMBER || "";
      const textRaw = buildWhatsAppText(createdOrderNumber);
      const phone = businessPhone.replace(/[^\d]/g, "");             // E.164 sin +
      const msg   = encodeURIComponent(textRaw);
        
      if (phone) {
        // Deep link (app) + fallback a wa.me SOLO si la app no abre
        const schemeUrl = `whatsapp://send?phone=${phone}&text=${msg}`;
        const webUrl    = `https://wa.me/${phone}?text=${msg}`;
      
        let launched = false;
        const onHide = () => { launched = true; };
        // Si la app abre, la página pasa a hidden/pagehide: cancelamos fallback
        window.addEventListener("pagehide", onHide, { once: true });
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) launched = true;
        }, { once: true });
      
        // Abrir en la MISMA pestaña (sin window.open)
        window.location.assign(schemeUrl);
      
        // Fallback después de ~900 ms SOLO si no se ocultó la página
        setTimeout(() => {
          if (!launched) window.location.assign(webUrl);
        }, 900);
      } else {
        // Sin número configurado: copiar mensaje y avisar
        try {
          await navigator.clipboard.writeText(textRaw);
          alert("Configurá NEXT_PUBLIC_WA_NUMBER. El detalle del pedido fue copiado al portapapeles.");
        } catch {
          alert("Configurá NEXT_PUBLIC_WA_NUMBER. Copiá y pegá este mensaje:\n\n" + textRaw);
        }
      }


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
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-color)] mb-3"
            value={customer.name}
            onChange={(e) =>
              setCustomer({ ...customer, name: e.target.value })
            }
            placeholder="Tu nombre"
          />

          <label className="block text-sm mb-1">Teléfono</label>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-color)] mb-3"
            value={customer.phone}
            onChange={(e) =>
              setCustomer({ ...customer, phone: e.target.value })
            }
            placeholder="Ej: 11 5555 5555"
          />

          <label className="block text-sm mb-1">Dirección</label>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-color)]"
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
                  ? "border-[var(--brand-color)] bg-[#fff5f2]"
                  : "border-transparent hover:bg-black/5"
              }`}
            >
              Delivery
            </button>
            <button
              onClick={() => setDeliveryMethod("pickup")}
              className={`px-3 py-2 rounded-lg border ${
                deliveryMethod === "pickup"
                  ? "border-[var(--brand-color)] bg-[#fff5f2]"
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
                  ? "border-[var(--brand-color)] bg-[#fff5f2]"
                  : "border-transparent hover:bg-black/5"
              }`}
            >
              Efectivo
            </button>
            <button
              onClick={() => setPaymentMethod("mp")}
              className={`px-3 py-2 rounded-lg border ${
                paymentMethod === "mp"
                  ? "border-[var(--brand-color)] bg-[#fff5f2]"
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
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-color)]"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Usá este campo para indicar timbre roto, forma de pago, referencias del domicilio, etc."
          />
        </div>
      </div>

      {/* Columna derecha: Resumen */}
      <div className="space-y-4">
        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
          <div className="text-sm font-semibold mb-3">Resumen</div>
          <div className="space-y-2">
            {sortedItems.map((it: any) => {
              const unit = it.finalPrice / it.quantity || it.price;

              const comboData = it as MaybeCombo;
              const isCombo =
                comboData.kind === "combo" ||
                Array.isArray(comboData.comboItems);

              const sizeLabel =
                (it.size as string) ||
                (comboData.optionName as string) ||
                undefined;

              if (!isCombo) {
                return (
                  <div
                    key={it.uniqueId}
                    className="flex items-start justify-between"
                  >
                    <div className="text-sm">
                      <div className="font-semibold">{it.name}</div>
                      <div className="text-muted-foreground">
                        {it.quantity} x {fmt(unit)}
                        {sizeLabel ? ` · Tamaño: ${sizeLabel}` : ""}
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
              }

              // Render para COMBO
              const main = comboData.comboItems?.find((x) => x.isMain);
              const extras = comboData.comboItems?.filter((x) => !x.isMain) || [];
              return (
                <div
                  key={it.uniqueId}
                  className="flex items-start justify-between"
                >
                  <div className="text-sm">
                    <div className="font-semibold">
                      {it.name} <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#fff5f2] border border-[var(--brand-color)]/30 text-[var(--brand-color)] font-semibold align-middle">COMBO</span>
                    </div>
                    <div className="text-muted-foreground">
                      {it.quantity} x {fmt(unit)}
                    </div>

                    <div className="mt-1 text-xs text-muted-foreground space-y-1">
                      {main && (
                        <div>
                          <span className="font-medium">Principal:</span>{" "}
                          {main.name || "Producto"}
                          {sizeLabel ? ` · Tamaño: ${sizeLabel}` : ""}
                          {main.qty && main.qty > 1 ? ` x${main.qty}` : ""}
                        </div>
                      )}
                      {extras.length > 0 && (
                        <div>
                          <span className="font-medium">Incluye:</span>
                          <ul className="list-disc pl-5">
                            {extras.map((e, idx) => (
                              <li key={idx}>
                                {e.name || "Ítem"}
                                {e.qty && e.qty > 1 ? ` x${e.qty}` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {it.observations?.trim() ? (
                        <div>Obs: {it.observations.trim()}</div>
                      ) : null}
                    </div>
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
            <div className="text-xl font-extrabold text-[var(--brand-color)]">
              {fmt(total)}
            </div>
          </div>
        </div>

        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4 space-y-2">
          <Button className={`w-full text-white transition-colors
                                    bg-[var(--brand-color)]
                                    hover:bg-[color-mix(in_srgb,var(--brand-color),#000_12%)]
                                    active:bg-[color-mix(in_srgb,var(--brand-color),#000_18%)]
                                    hover:brightness-95 active:brightness-90
                                    disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none
                                    ${!STORE_OPEN ? "opacity-60 cursor-not-allowed pointer-events-none" : ""}`
                                  } onClick={submitOrder} disabled={submitting}>
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
