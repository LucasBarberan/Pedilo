// components/checkout-form.tsx
"use client";

import { useCart, CartComboItem } from "@/components/cart-context";
import { Button } from "@/components/ui/button";
import { useRef, useEffect, useMemo, useState } from "react";
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
  // 🪝 TODOS LOS HOOKS VAN ACÁ
  const [customer, setCustomer] = useState<Customer>({
    name: "",
    phone: "",
    address: "",
  });

  const DELIVERY_ENABLED =
    (process.env.NEXT_PUBLIC_DELIVERY_ENABLED || "false").toLowerCase() === "true";
  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "pickup">(
    DELIVERY_ENABLED ? "delivery" : "pickup"
  );
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mp">("cash");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [phoneTouched, setPhoneTouched] = useState(false);
  const [formError, setFormError] = useState<string>("");
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const DELIVERY_FEE = Number(process.env.NEXT_PUBLIC_DELIVERY_FEE || 0);

  const total = useMemo(() => getTotalPrice(), [getTotalPrice]);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);


  const totalWithDelivery = useMemo(() => {
    return deliveryMethod === "delivery" ? total + DELIVERY_FEE : total;
  }, [total, deliveryMethod, DELIVERY_FEE]);
  const CHECKOUT_NOTES_MAX = 50; // o el número que prefieras



  // ORDEN a usar en Resumen + WhatsApp (considera selectedOptions, size u optionName)
  const sortedItems = useMemo(() => {
    return [...items].sort((a: any, b: any) => {
      // 1) Categorías default primero
      const da = a.isDefaultCategory ? 0 : 1;
      const db = b.isDefaultCategory ? 0 : 1;
      if (da !== db) return da - db;

      // 2) Tamaño: triple -> doble -> simple (sin tamaño al final)
      // Intentar obtener el tamaño desde selectedOptions primero
      let sa = "";
      if (a.selectedOptions && a.selectedOptions.length > 0) {
        const sizeOpt = a.selectedOptions.find((opt: any) => opt.tipo?.toLowerCase() === "tamaño");
        sa = sizeOpt ? String(sizeOpt.optionName || "").toLowerCase() : "";
      }
      if (!sa) {
        sa = String((a.size || (a as MaybeCombo).optionName || "")).toLowerCase();
      }

      let sb = "";
      if (b.selectedOptions && b.selectedOptions.length > 0) {
        const sizeOpt = b.selectedOptions.find((opt: any) => opt.tipo?.toLowerCase() === "tamaño");
        sb = sizeOpt ? String(sizeOpt.optionName || "").toLowerCase() : "";
      }
      if (!sb) {
        sb = String((b.size || (b as MaybeCombo).optionName || "")).toLowerCase();
      }

      const ra = SIZE_RANK[sa] ?? 99;
      const rb = SIZE_RANK[sb] ?? 99;
      if (ra !== rb) return ra - rb;

      // 3) Desempate por nombre
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [items]);





  // Cargar / guardar datos del cliente en localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("checkout.customer");
      if (raw) setCustomer(JSON.parse(raw));
    } catch { }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("checkout.customer", JSON.stringify(customer));
    } catch { }
  }, [customer]);
  // Normaliza teléfonos AR para guardar/enviar en formato "nacional limpio":
  // - sin 54, sin 0 inicial, sin 9 de móvil internacional, sin 15.
  const normalizePhoneAR = (raw: string) => {
    let digits = (raw || "").replace(/\D/g, "");
  
    // Si viene con 54 adelante, lo sacamos
    if (digits.startsWith("54")) digits = digits.slice(2);
  
    // Si viene con 0 adelante, lo sacamos (prefijo nacional)
    if (digits.startsWith("0")) digits = digits.slice(1);
  
    // Si viene con 9 adelante (móvil internacional: +54 9 ...), lo sacamos
    // Ej: 93537327969 -> 3537327969
    if (digits.startsWith("9")) digits = digits.slice(1);
  
    // Sacar "15" después del código de área (2 a 4 dígitos)
    // 11 15 55554444 -> 11 55554444
    digits = digits.replace(/^(\d{2,4})15(\d+)$/, "$1$2");
  
    return digits;
  };
  
  const isPhoneValid = (v: string) => {
    // Permitimos mientras tipean
    if (!/^[0-9\s()+-]*$/.test(v)) return false;
  
    const digits = normalizePhoneAR(v);
  
    // AR típico: 10 dígitos (área 2-4 + local 6-8) pero dejamos rango flexible
    return digits.length >= 8 && digits.length <= 15;
  };
  
  const getPhoneErrorMessage = (v: string) => {
    if (!/^[0-9\s()+-]*$/.test(v)) return "Solo números y símbolos válidos (+ - espacios)";
  
    const rawDigits = (v || "").replace(/\D/g, "");
    const digits = normalizePhoneAR(v);
  
    // Mensajes más específicos
    if (rawDigits.startsWith("0") && !v.trim().startsWith("+")) {
      return "❌ No incluyas el 0 inicial del código de área";
    }
    if (/^(54)?9?0/.test(rawDigits) && v.trim().startsWith("+")) {
      // raro pero por si meten +540...
      return "❌ No incluyas el 0 después de +54";
    }
    if (/^(54)?9?\d{2,4}15/.test(rawDigits)) {
      return "❌ No incluyas el 15 antes del número";
    }
  
    if (digits.length < 8) return "El teléfono es muy corto (mín. 8 dígitos)";
    if (digits.length > 15) return "El teléfono es muy largo (máx. 15 dígitos)";
  
    return "Revisá el formato del teléfono";
  };

  // debajo de isPhoneValid:
  const isNonEmpty = (s: string) => !!s.trim();

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

      // Construir label de opciones
      let optionsLabel = "";
      if (it.selectedOptions && it.selectedOptions.length > 0) {
        // Usar selectedOptions (nuevo formato)
        const optionNames = it.selectedOptions.map((opt: any) => opt.optionName).join(" + ");
        optionsLabel = ` (${optionNames})`;
      } else {
        // Fallback para compatibilidad
        const sizeLabel = (it.size as string) || (comboData.optionName as string);
        if (sizeLabel) optionsLabel = ` (tamaño: ${sizeLabel})`;
      }

      if (!isCombo) {
        lines.push(
          `• ${it.quantity} x ${it.name}${optionsLabel} – ${fmt(unit)} c/u`
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
            `   · Principal: ${main.name || "Producto"}${optionsLabel}${main.qty && main.qty > 1 ? ` x${main.qty}` : ""}`
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
    
    if (deliveryMethod === "delivery" && DELIVERY_FEE > 0) {
      lines.push(`*Sub Total:* ${fmt(total)}`);
      lines.push(`*Envío:* ${fmt(DELIVERY_FEE)}`);
      lines.push("");
    }
    
    lines.push(`*Total:* ${fmt(totalWithDelivery)}`);

    return lines.join("\n");
  }


  async function submitOrder() {
    if (items.length === 0) {
      return (
        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-6 text-center">
          Tu carrito está vacío.
        </div>
      );
    }
    if (!customer.name.trim()) {
      setFormError("Ingresá tu nombre y apellido.");
      nameRef.current?.focus();
      nameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!isPhoneValid(customer.phone)) {
      setPhoneTouched(true);
      const errorMsg = getPhoneErrorMessage(customer.phone);
      setFormError(errorMsg);
      phoneRef.current?.focus();
      phoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // si es delivery, pedimos dirección
    if (DELIVERY_ENABLED && deliveryMethod === "delivery" && !customer.address.trim()) {
      setFormError("Ingresá la dirección para el delivery.");
      addressRef.current?.focus();
      addressRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setFormError(""); // OK, seguimos
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
              items: (it.comboItems || []).map((ci: any) => {
                // 🔒 CRÍTICO: La cantidad del item interno SIEMPRE es la del backend
                // NO se multiplica por it.quantity (cantidad de combos)
                // El backend maneja la multiplicación: combo.quantity × item.quantity
                const itemQty = Number(ci.qty) || 1;

                const itemPayload: any = {
                  product_id: Number(ci.productId),
                  quantity: itemQty,  // Esta qty viene del backend y NO debe cambiar
                };

                // Si es el producto principal Y el combo tiene selectedOptions, usarlas
                if (ci.isMain && it.selectedOptions && it.selectedOptions.length > 0) {
                  itemPayload.option_ids = it.selectedOptions.map((opt: any) => Number(opt.productOptionId));
                }
                // Fallback: si tiene opción legacy en el comboItem
                else if (ci.option?.id) {
                  itemPayload.option_ids = [Number(ci.option.id)];
                }

                // Agregar comentario si es el principal
                if (ci.isMain && it.observations?.trim()) {
                  itemPayload.comment = it.observations.trim();
                }

                return itemPayload;
              }),
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

            // Enviar opciones seleccionadas
            if (it.selectedOptions && it.selectedOptions.length > 0) {
              payload.option_ids = it.selectedOptions.map(opt => Number(opt.productOptionId));
            } else if (it.productOptionId) {
              // Fallback para compatibilidad
              payload.option_ids = [Number(it.productOptionId)];
            }

            itemsForApi.push(payload);
          }
        }
        const channel = "WEB" as const;
        const fulfillment = deliveryMethod === "delivery" ? "DELIVERY" : "TAKEAWAY";
        const phoneNormalized = normalizePhoneAR(customer.phone);
        // 4) Delivery info (siempre provider WEB)
        const delivery_info =
          deliveryMethod === "delivery"
            ? {
              customerName: customer.name.trim(),
              customerPhone: phoneNormalized,
              addressText: customer.address.trim(),
              notes: notes?.trim() || null,
              scheduledAt: null,
              provider: "WEB",
              mapUrl: null,
            }
            : {
              customerName: customer.name.trim(),
              customerPhone: phoneNormalized,
              addressText: "", // vacío en retiro
              notes: notes?.trim() || null,
              scheduledAt: null,
              provider: "WEB",
              mapUrl: null,
            };

        // body
        const paymentMethodCode =
          paymentMethod === "cash"
            ? "CASH"
            : paymentMethod === "mp"
              ? "TRANSFER"
              : "CARD";

        const apiBodyRaw: any = {
          items: itemsForApi,
          combos: combosForApi,
          // New backend expects id/code. Send code; legacy enum deprecated.
          paymentMethodCode,
          amount_paid: Math.round(Number(total)),
          delivery_info,
          channel,                  // "WEB"
          fulfillment,              // "DELIVERY" | "TAKEAWAY"
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

      setShowWhatsAppModal(true);
      // WhatsApp (con número si lo tenemos)
      const businessPhone = process.env.NEXT_PUBLIC_WA_NUMBER || "";
      const textRaw = buildWhatsAppText(createdOrderNumber);
      const phone = businessPhone.replace(/[^\d]/g, "");             // E.164 sin +
      const msg = encodeURIComponent(textRaw);
      

      if (phone) {
        const schemeUrl = `whatsapp://send?phone=${phone}&text=${msg}`;
        const webUrl = `https://wa.me/${phone}?text=${msg}`;
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            
        // En desktop vamos directo a WhatsApp Web
        if (!isMobile) {
          window.location.assign(webUrl);
          return;
        }
      
        let launched = false;
        let timer: number;
      
        const cleanup = () => {
          launched = true;
          clearTimeout(timer);
          window.removeEventListener("pagehide", onHide);
          window.removeEventListener("blur", onHide);
          document.removeEventListener("visibilitychange", onVisibility);
        };
      
        const onHide = () => cleanup();
        const onVisibility = () => {
          if (document.hidden) cleanup();
        };
      
        // Si la app se abre, la pestaña pierde foco/visibilidad → cancelamos fallback
        window.addEventListener("pagehide", onHide, { once: true });
        window.addEventListener("blur", onHide, { once: true });
        document.addEventListener("visibilitychange", onVisibility, { once: true });
      
        // ✅ MOSTRAR CARTEL ANTES DE SALIR
        setShowWhatsAppModal(true);
      
        // ✅ Esperar a que React renderice (2 frames) + delay cortito
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      
        // Abrimos la app (con delay chico para que se vea)
        window.setTimeout(() => {
          window.location.assign(schemeUrl);
        
          // Fallback SOLO si seguimos en esta pestaña con foco
          timer = window.setTimeout(() => {
            const stillHere =
              !launched && document.visibilityState === "visible" && document.hasFocus();
            if (stillHere) window.location.assign(webUrl);
          }, 2400); // dejé tu mismo tiempo
        }, 1600);
      
        return;
      } else {
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

        {/* Entrega — MOVER ARRIBA */}
        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
          <div className="text-sm font-semibold mb-3">Entrega</div>

          {DELIVERY_ENABLED ? (
            <div className="flex gap-2">
              <button
                onClick={() => setDeliveryMethod("delivery")}
                className={`px-3 py-2 rounded-lg border ${deliveryMethod === "delivery"
                    ? "border-[var(--brand-color)] bg-[#fff5f2]"
                    : "border-transparent hover:bg-black/5"
                  }`}
              >
                Delivery
              </button>
              <button
                onClick={() => setDeliveryMethod("pickup")}
                className={`px-3 py-2 rounded-lg border ${deliveryMethod === "pickup"
                    ? "border-[var(--brand-color)] bg-[#fff5f2]"
                    : "border-transparent hover:bg-black/5"
                  }`}
              >
                Retiro en local
              </button>
            </div>
          ) : (
            // Delivery deshabilitado: mostramos fijo “Retiro”
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--brand-color)] bg-[#fff5f2]">
              <span className="text-sm font-medium">Retiro en local</span>
            </div>
          )}
          {deliveryMethod === "delivery" && DELIVERY_FEE > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Se agregará un costo de envío de {fmt(DELIVERY_FEE)} al total.
            </p>
          )}
        </div>

        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
          <div className="text-sm font-semibold mb-3">Datos del cliente</div>

          <label className="block text-sm mb-1">Nombre y Apellido</label>
          <input
            ref={nameRef}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-color)] mb-3"
            value={customer.name}
            onChange={(e) => {
              const v = e.target.value;
              setCustomer({ ...customer, name: v });
              if (formError && v.trim() && /nombre/i.test(formError)) setFormError("");
            }}
            placeholder="Tu nombre"
          />

          <label className="block text-sm mb-1">Teléfono</label>
          <input
            ref={phoneRef}
            id="phone-input"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            pattern="[0-9\s()+\-]{8,15}"
            title="Sin 0 inicial ni 15. Ej: 1155554444 o +541155554444"
            className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 mb-1 ${phoneTouched && !isPhoneValid(customer.phone)
                ? "border-red-500 focus:ring-red-400"
                : "focus:ring-[var(--brand-color)]"
              }`}
            value={customer.phone}
            onChange={(e) => {
              const v = e.target.value;
              setCustomer({ ...customer, phone: v });
              if (formError && isPhoneValid(v)) setFormError("");
            }}
            onBlur={() => {
                setPhoneTouched(true);
                const normalized = normalizePhoneAR(customer.phone);
                if (normalized !== customer.phone) {
                  setCustomer({ ...customer, phone: normalized });
                }
              }}
            placeholder="Ej: 1155554444"
            aria-invalid={phoneTouched && !isPhoneValid(customer.phone)}
            aria-describedby="phone-help"
          />
          <p id="phone-help" className={`text-xs mb-3 ${phoneTouched && !isPhoneValid(customer.phone) ? "text-red-600" : "text-muted-foreground"
            }`}>
            {phoneTouched && !isPhoneValid(customer.phone) ? (
              getPhoneErrorMessage(customer.phone)
            ) : (
              "* Sin 0 inicial ni 15. Ejemplos: 1155554444 o +541155554444"
            )}
          </p>

          {/* Dirección SOLO si delivery */}
          {deliveryMethod === "delivery" && (
            <>
              <label className="block text-sm mb-1">Dirección</label>
              <input
                ref={addressRef}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-color)]"
                value={customer.address}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomer({ ...customer, address: v });
                  if (formError && v.trim() && /direcci[oó]n/i.test(formError)) setFormError("");
                }}
                placeholder="Calle 123, Piso/Depto"
              />
            </>
          )}
        </div>



        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
          <div className="text-sm font-semibold mb-3">Pago</div>
          <div className="flex gap-2">
            <button
              onClick={() => setPaymentMethod("cash")}
              className={`px-3 py-2 rounded-lg border ${paymentMethod === "cash"
                ? "border-[var(--brand-color)] bg-[#fff5f2]"
                : "border-transparent hover:bg-black/5"
                }`}
            >
              Efectivo
            </button>
            <button
              onClick={() => setPaymentMethod("mp")}
              className={`px-3 py-2 rounded-lg border ${paymentMethod === "mp"
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
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, CHECKOUT_NOTES_MAX))} // hard limit
            maxLength={CHECKOUT_NOTES_MAX}
            rows={2} // arranca chico
            placeholder="Usá este campo para indicar timbre roto, forma de pago, referencias del domicilio, etc."
            className="w-full rounded-md border px-3 py-2 text-sm outline-none
                    focus:ring-2 focus:ring-[var(--brand-color)]
                    resize-none min-h-[40px]"
            onInput={(e) => {
              // auto-grow hasta un tope para que no se haga gigante
              const ta = e.currentTarget;
              ta.style.height = "auto";
              ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; // ~4–5 líneas
            }}
            aria-describedby="checkout-notes-counter"
          />

          <div
            id="checkout-notes-counter"
            className="mt-1 text-xs text-muted-foreground text-right"
          >
            {notes.length}/{CHECKOUT_NOTES_MAX}
          </div>
        </div>
      </div>

      {/* Columna derecha: Resumen */}
      <div className="space-y-4">
        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4 md:sticky md:top-4">
          <div className="text-sm font-semibold mb-3">Resumen</div>

          {/* LISTA SCROLLEABLE */}
          <div className="space-y-2 max-h-[45vh] md:max-h-[55vh] overflow-y-auto pr-1">
            {sortedItems.map((it: any) => {
              const unit = it.finalPrice / it.quantity || it.price;
              const comboData = it as MaybeCombo;
              const isCombo = comboData.kind === "combo" || Array.isArray(comboData.comboItems);
              const sizeLabel = (it.size as string) || (comboData.optionName as string) || undefined;

              if (!isCombo) {
                return (
                  <div key={it.uniqueId} className="flex items-start justify-between">
                    <div className="text-sm">
                      <div className="font-semibold">{it.name}</div>
                      <div className="text-muted-foreground">
                        {it.quantity} x {fmt(unit)}{sizeLabel ? ` · Tamaño: ${sizeLabel}` : ""}
                      </div>
                      {it.observations?.trim() ? (
                        <div className="text-muted-foreground">Obs: {it.observations.trim()}</div>
                      ) : null}
                    </div>
                    <div className="text-sm font-semibold">
                      {fmt(it.finalPrice || it.price * it.quantity)}
                    </div>
                  </div>
                );
              }

              const main = comboData.comboItems?.find((x) => x.isMain);
              const extras = comboData.comboItems?.filter((x) => !x.isMain) || [];

              return (
                <div key={it.uniqueId} className="flex items-start justify-between">
                  <div className="text-sm">
                    <div className="font-semibold">
                      {it.name}{" "}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#fff5f2] border border-[var(--brand-color)]/30 text-[var(--brand-color)] font-semibold align-middle">
                        COMBO
                      </span>
                    </div>
                    <div className="text-muted-foreground">{it.quantity} x {fmt(unit)}</div>

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
                                {e.name || "Ítem"}{e.qty && e.qty > 1 ? ` x${e.qty}` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {it.observations?.trim() ? <div>Obs: {it.observations.trim()}</div> : null}
                    </div>
                  </div>

                  <div className="text-sm font-semibold">
                    {fmt(it.finalPrice || it.price * it.quantity)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* FOOTER FIJO DENTRO DE LA CARD */}
          <div className="flex items-center justify-between border-t mt-3 pt-3 bg-white/0">
            <div className="w-full space-y-1">
              {deliveryMethod === "delivery" && DELIVERY_FEE > 0 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Sub Total</span>
                  <span>{fmt(total)}</span>
                </div>
              )}
              {deliveryMethod === "delivery" && DELIVERY_FEE > 0 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Envío</span>
                  <span>{fmt(DELIVERY_FEE)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Total:</span>
                <span className="text-xl font-extrabold text-[var(--brand-color)]">
                  {fmt(totalWithDelivery)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {formError && (
          <div className="mx-auto w-full max-w-6xl px-4">
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 text-red-700 p-3 flex items-start justify-between">
              <div className="text-sm">⚠️ {formError}</div>
              <button
                onClick={() => setFormError("")}
                className="ml-3 rounded-md px-2 py-1 hover:bg-red-100"
                aria-label="Cerrar advertencia"
              >
                ✕
              </button>
            </div>
          </div>
        )}

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
        {showWhatsAppModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center">
              <div className="text-3xl mb-2">📲</div>
              <h3 className="text-lg font-bold mb-2">Pedido casi listo</h3>
              <p className="text-sm text-gray-700 mb-4">
                No olvides <strong>enviar el mensaje por WhatsApp</strong> para que podamos
                <strong> confirmar tu pedido</strong>.
              </p>
              <p className="text-xs text-gray-500">Te estamos redirigiendo…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
