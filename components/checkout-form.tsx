// components/checkout-form.tsx
"use client";

import { useCart, CartComboItem } from "@/components/cart-context";
import { Button } from "@/components/ui/button";
import { useRef, useEffect, useMemo, useState } from "react";
import { useOnlineConfig } from "@/lib/hooks/useOnlineConfig";
import { useBusinessStatusSmart } from "@/lib/hooks/useBusinessStatus";
import { useCartRefresh } from "@/hooks/useCartRefresh";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { DeliveryMap } from "@/components/delivery-map";
import { fetchDeliveryQuote, fetchDeliveryPricingEnabled, fetchDeliveryLocationBias, type DeliveryQuoteResponse } from "@/lib/api/delivery";

type Customer = {
  name: string;
  phone: string;
  address: string;
  addressUnit: string;
  placeId?: string;
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
  const { config, isLoading: configLoading } = useOnlineConfig();
  const { data: businessStatus } = useBusinessStatusSmart();
  const DELIVERY_ENABLED = config.deliveryEnabled;
  const DELIVERY_FEE = config.deliveryFee;
  const SCHEDULED_ORDERS_ENABLED = config.scheduledOrdersEnabled;
  const SCHEDULED_ORDERS_LEAD_MINUTES = config.scheduledOrdersLeadMinutes;
  const storeOpen = businessStatus?.web?.open ?? true;

  // 🪝 TODOS LOS HOOKS VAN ACÁ
  const [customer, setCustomer] = useState<Customer>({
    name: "",
    phone: "",
    address: "",
    addressUnit: "",
  });

  // Cotización de envío por distancia real (delivery-pricing). El precio
  // mostrado acá es solo informativo — el Backend recalcula todo al confirmar
  // el pedido (server-authoritative). `null` = todavía no se cotizó nada.
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuoteResponse | null>(null);
  const [quotingDelivery, setQuotingDelivery] = useState(false);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState<string>("");

  // Con DELIVERY_PRICING activo, no alcanza con tipear texto libre: el
  // usuario tiene que elegir una sugerencia real del autocomplete (o soltar
  // el pin en el mapa) para que exista una ubicación geocodificada. Sin esto,
  // el cajero termina teniendo que llamar para preguntar la dirección y
  // calcular el envío a mano. Se resetea a false apenas el usuario vuelve a
  // tipear en el input.
  const [addressConfirmed, setAddressConfirmed] = useState(false);

  // Módulo DELIVERY_PRICING: mientras no se confirme habilitado, no se monta
  // el autocomplete ni se llama a /api/delivery/quote — se usa directo el fee
  // fijo (mismo comportamiento que si la dirección estuviera fuera de cobertura).
  const [deliveryPricingEnabled, setDeliveryPricingEnabled] = useState(false);
  useEffect(() => {
    fetchDeliveryPricingEnabled().then(setDeliveryPricingEnabled);
  }, []);

  // Centro/radio para priorizar sugerencias del autocomplete cercanas a la
  // zona real de cobertura del comercio (ver AddressAutocomplete locationBias).
  const [deliveryLocationBias, setDeliveryLocationBias] = useState<{ latitude: number; longitude: number; radiusMeters: number } | null>(null);
  useEffect(() => {
    fetchDeliveryLocationBias().then(setDeliveryLocationBias);
  }, []);

  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "pickup" | null>(
    DELIVERY_ENABLED ? null : "pickup"
  );
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mp">("cash");
  const [notes, setNotes] = useState("");

  // Pedidos programados: se asume siempre para el mismo día — el input es solo horario (HH:mm)
  const [scheduleLater, setScheduleLater] = useState(false); // destildado por defecto = "pedir para ya"
  const [scheduledTime, setScheduledTime] = useState(""); // valor de <input type="time">, formato "HH:mm"

  const minScheduledTime = useMemo(() => {
    const d = new Date(Date.now() + SCHEDULED_ORDERS_LEAD_MINUTES * 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [SCHEDULED_ORDERS_LEAD_MINUTES]);

  // Combina el horario elegido (HH:mm) con la fecha de hoy → ISO
  const scheduledTimeToISO = (time: string): string | null => {
    if (!time) return null;
    const [h, m] = time.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const [submitting, setSubmitting] = useState(false);
  const { refreshCartPrices, isRefreshing, cartSummary } = useCartRefresh();

  useEffect(() => {
    refreshCartPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuando la config carga, si delivery está habilitado reseteamos a null
  // para que el usuario tenga que elegir explícitamente
  useEffect(() => {
    if (!configLoading && DELIVERY_ENABLED) {
      setDeliveryMethod(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configLoading]);

  const [phoneTouched, setPhoneTouched] = useState(false);
  const [formError, setFormError] = useState<string>("");
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement | null>(null);

  const total = useMemo(() => getTotalPrice(), [getTotalPrice]);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  // Precio de envío a mostrar: prioriza la cotización real por distancia.
  // Con el módulo DELIVERY_PRICING habilitado, el fee fijo legado ya no
  // aplica como respaldo — si no hay cotización, la dirección está fuera de
  // cobertura, o el servicio de ruteo falló, el envío queda en 0 ("a
  // coordinar con el local"), nunca en el valor fijo que pudiera haber
  // quedado cargado de antes. Ese fee fijo solo se usa con el módulo
  // deshabilitado. El Backend vuelve a calcular todo al confirmar.
  const resolvedDeliveryPrice = useMemo(() => {
    if (deliveryQuote?.withinCoverage && deliveryQuote.price != null) {
      return deliveryQuote.price;
    }
    if (deliveryPricingEnabled) return 0;
    return DELIVERY_FEE;
  }, [deliveryQuote, DELIVERY_FEE, deliveryPricingEnabled]);

  const deliveryOutOfCoverage = deliveryQuote != null && !deliveryQuote.withinCoverage;

  const totalWithDelivery = useMemo(() => {
    return deliveryMethod === "delivery" ? total + resolvedDeliveryPrice : total;
  }, [total, deliveryMethod, resolvedDeliveryPrice]);
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

  /** Se dispara cuando el usuario elige una sugerencia del autocomplete de Google. */
  async function handleAddressSelect(selection: { address: string; placeId: string }) {
    // No pisamos customer.address con selection.address acá — el input ya
    // muestra el texto elegido (vía onChange, disparado antes que esta
    // función) y volver a setearlo con el formattedAddress de Google
    // causaba un "salto" visual si difería levemente del texto tipeado.
    setCustomer((prev) => ({ ...prev, placeId: selection.placeId }));
    setDeliveryQuoteError("");
    setAddressConfirmed(true);
    setQuotingDelivery(true);
    try {
      const quote = await fetchDeliveryQuote({ placeId: selection.placeId });
      setDeliveryQuote(quote);
    } catch {
      setDeliveryQuote(null);
      setDeliveryQuoteError("No pudimos calcular el envío para esa dirección. Se coordina con el local.");
    } finally {
      setQuotingDelivery(false);
    }
  }

  /**
   * Se dispara al soltar el pin arrastrado en el mapa. A diferencia de
   * handleAddressSelect, acá SÍ actualizamos customer.address con lo que
   * devuelve el Backend — no hay ningún texto "ya visto" que preservar, el
   * pin se movió a un punto que todavía no tiene descripción en pantalla.
   * Un punto arrastrado a mano no tiene placeId (Google no lo genera para
   * coordenadas arbitrarias), así que se cotiza con latitude/longitude.
   */
  async function handlePinDrag(location: { latitude: number; longitude: number }) {
    setCustomer((prev) => ({ ...prev, placeId: undefined }));
    setDeliveryQuoteError("");
    setAddressConfirmed(true);
    setQuotingDelivery(true);
    try {
      const quote = await fetchDeliveryQuote(location);
      setDeliveryQuote(quote);
      if (quote.addressResolved) {
        setCustomer((prev) => ({ ...prev, address: quote.addressResolved! }));
      }
    } catch {
      setDeliveryQuote(null);
      setDeliveryQuoteError("No pudimos calcular el envío para esa ubicación. Se coordina con el local.");
    } finally {
      setQuotingDelivery(false);
    }
  }


  // Cargar / guardar datos del cliente en localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("checkout.customer");
      if (raw) {
        const saved = JSON.parse(raw);
        setCustomer((prev) => ({ ...prev, ...saved }));
        if (saved.placeId) setAddressConfirmed(true);
      }
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
  const STORE_NAME = config.storeName || "SRA. BURGA";
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";


  /** 🔹 Arma el texto de WhatsApp (usa el mismo orden del resumen) */
  function buildWhatsAppText(orderNumber?: number | string, trackingToken?: string, confirmedTotal?: number) {
    const lines: string[] = [];

    const headerSuffix = orderNumber ? ` – Pedido #${orderNumber}` : "";
    lines.push(`*${STORE_NAME}${headerSuffix}*`);
    lines.push("");
    lines.push(`*Cliente:* ${customer.name}`);
    if (customer.phone?.trim()) lines.push(`*Tel:* ${customer.phone}`);
    if (deliveryMethod === "delivery" && customer.address?.trim()) {
      const unit = customer.addressUnit?.trim();
      lines.push(`*Dirección:* ${customer.address}${unit ? ` (${unit})` : ""}`);
    }
    lines.push(
      `*Entrega:* ${deliveryMethod === "delivery" ? "Delivery" : "Retiro"}`
    );
    if (SCHEDULED_ORDERS_ENABLED && scheduleLater && scheduledTime) {
      lines.push(`*Horario pedido:* ${scheduledTime} hs`);
    }
    lines.push(
      `*Pago:* ${paymentMethod === "cash" ? "Efectivo" : "Mercado Pago"}`
    );
    if (notes?.trim()) lines.push(`*Obs generales:* ${notes.trim()}`);
    lines.push("");
    lines.push("*Detalle:*");

    // 👇 usar el ordenamiento y desglosar combos
    sortedItems.forEach((it: any) => {
      const unit = Math.round((it.finalPrice / it.quantity || it.price) * 100) / 100;
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
        if (sizeLabel) optionsLabel = ` (${sizeLabel})`;
      }

      if (!isCombo) {
        lines.push(
          `• ${it.quantity} x ${it.name}${optionsLabel} – ${fmt(unit)}${it.quantity > 1 ? " c/u" : ""}`
        );
        if (it.observations?.trim()) {
          lines.push(`   Obs: ${it.observations.trim()}`);
        }
      } else {
        lines.push(
          `• ${it.quantity} x ${it.name} – ${fmt(unit)}${it.quantity > 1 ? " c/u" : ""}`
        );
        if (it.observations?.trim()) {
          lines.push(`   Obs: ${it.observations.trim()}`);
        }

        const allComboItems = comboData.comboItems || [];

        allComboItems.forEach((ci: any) => {
          const ciOpts: string[] = Array.isArray(ci.selectedOptions)
            ? ci.selectedOptions.map((o: any) => o.optionName).filter(Boolean)
            : ci.isMain
              ? (it.selectedOptions?.map((o: any) => o.optionName).filter(Boolean) || [])
              : [];
          const ciOptsLabel = ciOpts.length > 0 ? ` (${ciOpts.join(" · ")})` : "";
          lines.push(
            `\t\t${ci.name || "Producto"}${ciOptsLabel}${ci.qty && ci.qty > 1 ? ` x${ci.qty}` : ""}`
          );
          if (ci.comment?.trim()) {
            lines.push(`\t\t   "${ci.comment.trim()}"`);
          }
        });
      }
    });

    lines.push("");

    // Prioridad: total del quote (con promo) > total confirmado por API > total del carrito
    const baseTotal = cartSummary?.total ?? confirmedTotal ?? total;
    const confirmedTotalWithDelivery = Math.round(deliveryMethod === "delivery" ? baseTotal + resolvedDeliveryPrice : baseTotal);

    if (deliveryMethod === "delivery") {
      lines.push(`*Subtotal:* ${fmt(Math.round(baseTotal))}`);
      lines.push(`*Envío:* ${deliveryQuote?.withinCoverage && deliveryQuote.price != null ? fmt(deliveryQuote.price) : (resolvedDeliveryPrice > 0 ? fmt(resolvedDeliveryPrice) : "A coordinar con el local")}`);
    }

    lines.push(`*Total:* ${fmt(confirmedTotalWithDelivery)}`);

    // Agregar link de seguimiento si existe
    if (trackingToken) {
      lines.push("");
      const trackingUrl = `${window.location.origin}/seguimiento/${trackingToken}`;
      lines.push(`*Seguí tu pedido acá:* ${trackingUrl}`);
    }

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
    // validar que eligió un método de envío
    if (DELIVERY_ENABLED && deliveryMethod === null) {
      setFormError("Seleccioná un método de entrega: Delivery o Retiro en el local.");
      return;
    }
    // si es delivery, pedimos dirección
    if (DELIVERY_ENABLED && deliveryMethod === "delivery" && !customer.address.trim()) {
      setFormError("Ingresá la dirección para el delivery.");
      addressRef.current?.focus();
      addressRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // con DELIVERY_PRICING activo no alcanza con tipear texto libre: hace
    // falta elegir una sugerencia del autocomplete (o soltar el pin en el
    // mapa) para tener una ubicación geocodificada y poder cotizar el envío
    if (DELIVERY_ENABLED && deliveryMethod === "delivery" && deliveryPricingEnabled && !addressConfirmed) {
      setFormError("Elegí tu dirección de la lista de sugerencias (no alcanza con escribirla).");
      addressRef.current?.focus();
      addressRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // si eligió programar el pedido, validamos el horario (ayuda de UX — el backend vuelve a validar)
    if (SCHEDULED_ORDERS_ENABLED && scheduleLater) {
      if (!scheduledTime) {
        setFormError("Elegí un horario para tu pedido.");
        return;
      }
      if (scheduledTime < minScheduledTime) {
        setFormError(`El horario debe tener al menos ${SCHEDULED_ORDERS_LEAD_MINUTES} minutos de anticipación.`);
        return;
      }
    }

    setFormError(""); // OK, seguimos
    setSubmitting(true);

    try {
      let createdOrderNumber: number | string | undefined;
      let createdTrackingToken: string | undefined;
      let createdTotal: number | undefined;


      if (!BASE) throw new Error("Falta NEXT_PUBLIC_API_URL");

      const itemsForApi: any[] = [];
      const combosForApi: any[] = [];

      for (const it of items) {
        if (it.kind === "combo") {
          // precio unitario del combo (el back prorratea internamente)
          const unitCombo = Math.round(Number(it.price));

          // Detectar si el combo usa el nuevo stepper de slots (tiene comboItemId)
          const hasSlotData = (it.comboItems || []).some((ci: any) => ci.comboItemId != null);

          const comboPayload: any = {
            product_template_id: Number(it.id),
            name: it.comboName || it.name,
            quantity: Number(it.quantity),
            unit_price: unitCombo,
            comment: it.observations?.trim() || null,
          };

          if (hasSlotData) {
            // Nuevo formato con slots[] — separar los slots reales (con comboItemId) de las
            // inclusiones por categoría (isInclusion: true, sin comboItemId): van en dos campos
            // distintos del payload, mezclarlos manda combo_item_id null y el backend lo rechaza.
            comboPayload.slots = (it.comboItems || [])
              .filter((ci: any) => !ci.isInclusion && ci.comboItemId != null)
              .map((ci: any) => ({
                combo_item_id: Number(ci.comboItemId),
                slot_index: Number(ci.slotIndex ?? 0),
                option_ids: Array.isArray(ci.optionIds) ? ci.optionIds.map(Number) : [],
                ...(Array.isArray(ci.options) && ci.options.length > 0 ? { options: ci.options } : {}),
                ...(ci.comment?.trim() ? { comment: ci.comment.trim() } : {}),
              }));

            const inclusionGroups = new Map<string, number[]>();
            for (const ci of (it.comboItems || [])) {
              if (!ci.isInclusion || ci.inclusionId == null) continue;
              const list = inclusionGroups.get(String(ci.inclusionId)) ?? [];
              list.push(Number(ci.productId));
              inclusionGroups.set(String(ci.inclusionId), list);
            }
            if (inclusionGroups.size > 0) {
              comboPayload.inclusion_selections = Array.from(inclusionGroups.entries()).map(
                ([inclusionId, productIds]) => ({
                  inclusion_id: Number(inclusionId),
                  product_ids: productIds,
                })
              );
            }
          } else {
            // Formato legacy con items[]
            comboPayload.items = (it.comboItems || []).map((ci: any) => {
              const itemQty = Number(ci.qty) || 1;
              const itemPayload: any = {
                product_id: Number(ci.productId),
                quantity: itemQty,
              };
              if (ci.isMain && it.selectedOptions && it.selectedOptions.length > 0) {
                itemPayload.options = it.selectedOptions.map((opt: any) => ({
                  id: Number(opt.productOptionId),
                  qty: Number(opt.qty ?? 1),
                }));
              } else if (ci.option?.id) {
                itemPayload.options = [{ id: Number(ci.option.id), qty: 1 }];
              }
              if (ci.isMain && it.observations?.trim()) {
                itemPayload.comment = it.observations.trim();
              }
              return itemPayload;
            });
          }

          combosForApi.push(comboPayload);
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

          // Enviar opciones seleccionadas (con cantidad — necesario para grupos allowsQuantity)
          if (it.selectedOptions && it.selectedOptions.length > 0) {
            payload.options = it.selectedOptions.map(opt => ({
              id: Number(opt.productOptionId),
              qty: Number((opt as any).qty ?? 1),
            }));
          } else if (it.productOptionId) {
            // Fallback para compatibilidad
            payload.options = [{ id: Number(it.productOptionId), qty: 1 }];
          }

          itemsForApi.push(payload);
        }
      }
      const channel = "WEB" as const;
      const fulfillment = deliveryMethod === "delivery" ? "DELIVERY" : "TAKEAWAY";
      const phoneNormalized = normalizePhoneAR(customer.phone);
      const scheduledAtISO =
        SCHEDULED_ORDERS_ENABLED && scheduleLater && scheduledTime
          ? scheduledTimeToISO(scheduledTime)
          : null;
      // 4) Delivery info (siempre provider WEB). El Backend recalcula
      // distancia/precio de envío a partir de placeId — nunca confía en un
      // precio mostrado en esta pantalla (ver delivery-pricing design.md).
      // addressText incluye el piso/depto solo como dato de display para el
      // local — el geocoding/cotización usa placeId, que resuelve la
      // dirección de calle, no el piso/depto.
      const addressUnitTrimmed = customer.addressUnit.trim();
      const fullAddressText = addressUnitTrimmed
        ? `${customer.address.trim()} (${addressUnitTrimmed})`
        : customer.address.trim();

      const delivery_info =
        deliveryMethod === "delivery"
          ? {
            customerName: customer.name.trim(),
            customerPhone: phoneNormalized,
            addressText: fullAddressText,
            notes: notes?.trim() || null,
            scheduledAt: scheduledAtISO,
            provider: "WEB",
            mapUrl: null,
            placeId: customer.placeId ?? null,
          }
          : {
            customerName: customer.name.trim(),
            customerPhone: phoneNormalized,
            addressText: "", // vacío en retiro
            notes: notes?.trim() || null,
            scheduledAt: scheduledAtISO,
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

      // limpieza defensiva (sin undefined). OJO: "options" ({id,qty}[]) es un campo
      // válido que el backend espera (necesario para grupos allowsQuantity / cantidad
      // por opción) — no debe filtrarse acá.
      const apiBody = JSON.parse(
        JSON.stringify(apiBodyRaw, (_k, v) => (v === undefined ? undefined : v))
      );

      console.log("POST /orders body =>\n", JSON.stringify(apiBody, null, 2));

      const res = await fetch(`/api/checkout`, {
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

      // intentar extraer el número de pedido y tracking token para WhatsApp
      try {
        const parsed = JSON.parse(text);
        createdOrderNumber =
          parsed?.data?.orderNumber ??
          parsed?.orderNumber ??
          parsed?.data?.order?.orderNumber ??
          undefined;
        createdTrackingToken =
          parsed?.data?.trackingToken ??
          parsed?.trackingToken ??
          undefined;
        const rawTotal = parsed?.data?.total ?? parsed?.total;
        if (rawTotal != null) createdTotal = Number(rawTotal);
      } catch {
        // si no es JSON, dejamos undefined
      }

      setShowWhatsAppModal(true);
      // WhatsApp (con número si lo tenemos)
      const businessPhone = config.waNumber || "";
      const textRaw = buildWhatsAppText(createdOrderNumber, createdTrackingToken, createdTotal);
      const phone = businessPhone.replace(/[^\d]/g, "");             // E.164 sin +
      const msg = encodeURIComponent(textRaw);


      if (phone) {
        const schemeUrl = `whatsapp://send?phone=${phone}&text=${msg}`;
        const webUrl = `https://wa.me/${phone}?text=${msg}`;
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        // En desktop vamos directo a WhatsApp Web
        if (!isMobile) {
          window.open(webUrl, "_blank");
          // Limpiar y redirigir a seguimiento
          if (createdTrackingToken) {
            setTimeout(() => {
              clearCart();
              window.location.href = `${APP_URL}/seguimiento/${createdTrackingToken}`;
            }, 500);
          } else {
            clearCart();
            onSuccess?.();
          }
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

        // Después de un tiempo, redirigir a la página de seguimiento
        if (createdTrackingToken) {
          setTimeout(() => {
            clearCart();
            window.location.href = `${APP_URL}/seguimiento/${createdTrackingToken}`;
          }, 5000); // 5 segundos para que el usuario vea que se abre WhatsApp
        } else {
          setTimeout(() => {
            clearCart();
            onSuccess?.();
          }, 5000);
        }

        return;
      } else {
        try {
          await navigator.clipboard.writeText(textRaw);
          alert("Número de WhatsApp no configurado. El detalle del pedido fue copiado al portapapeles.");
        } catch {
          alert("Número de WhatsApp no configurado. Copiá y pegá este mensaje:\n\n" + textRaw);
        }
      }
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
        <div className={`rounded-2xl ring-1 bg-white/60 p-4 ${
          formError.includes("método de entrega") ? "ring-red-400" : "ring-black/5"
        }`}>
          <div className="text-sm font-semibold mb-3">Entrega</div>

          {DELIVERY_ENABLED ? (
            <div className="flex gap-2">
              <button
                onClick={() => { setDeliveryMethod("delivery"); setFormError(""); }}
                className={`px-3 py-2 rounded-lg border ${deliveryMethod === "delivery"
                  ? "border-[var(--brand-color)] bg-[#fff5f2]"
                  : "border-transparent hover:bg-black/5"
                  }`}
              >
                Delivery
              </button>
              <button
                onClick={() => { setDeliveryMethod("pickup"); setFormError(""); }}
                className={`px-3 py-2 rounded-lg border ${deliveryMethod === "pickup"
                  ? "border-[var(--brand-color)] bg-[#fff5f2]"
                  : "border-transparent hover:bg-black/5"
                  }`}
              >
                Retiro en el local
              </button>
            </div>
          ) : (
            // Delivery deshabilitado: mostramos fijo “Retiro”
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--brand-color)] bg-[#fff5f2]">
              <span className="text-sm font-medium">Retiro en local</span>
            </div>
          )}
          {deliveryMethod === "delivery" && !deliveryQuote && (
            <p className="mt-2 text-xs text-muted-foreground">
              El costo de envío se calcula según la distancia a tu domicilio.
            </p>
          )}

          {SCHEDULED_ORDERS_ENABLED && (
            <div className="mt-3 pt-3 border-t border-black/5">
              <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
                <span className="text-sm font-medium">Programá tu pedido</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={scheduleLater}
                  onClick={() => {
                    setScheduleLater((v) => {
                      const next = !v;
                      if (next && !scheduledTime) setScheduledTime(minScheduledTime);
                      return next;
                    });
                    setFormError("");
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${scheduleLater ? "bg-[var(--brand-color)]" : "bg-gray-300"
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${scheduleLater ? "translate-x-6" : "translate-x-1"
                      }`}
                  />
                </button>
              </label>
              {scheduleLater ? (
                <div className="mt-2">
                  <input
                    type="time"
                    min={minScheduledTime}
                    value={scheduledTime}
                    onChange={(e) => {
                      setScheduledTime(e.target.value);
                      if (formError.includes("horario")) setFormError("");
                    }}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-color)]"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Anticipación mínima: {SCHEDULED_ORDERS_LEAD_MINUTES} minutos.
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Activá esta opción si querés tu pedido para un horario específico.
                </p>
              )}
            </div>
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
              {deliveryPricingEnabled ? (
                <>
                  <AddressAutocomplete
                    onInputElement={(el) => { addressRef.current = el; }}
                    value={customer.address}
                    onChange={(v) => {
                      setCustomer((prev) => ({ ...prev, address: v, placeId: undefined }));
                      setDeliveryQuote(null);
                      setDeliveryQuoteError("");
                      setAddressConfirmed(false);
                      if (formError && v.trim() && /direcci[oó]n/i.test(formError)) setFormError("");
                    }}
                    onPlaceSelect={handleAddressSelect}
                    locationBias={deliveryLocationBias}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-color)]"
                    placeholder="Empezá a escribir tu dirección..."
                  />
                  {!quotingDelivery && deliveryOutOfCoverage && (
                    <p className="mt-1 text-xs text-amber-600">
                      Esa dirección está fuera de nuestra zona de cobertura. El envío se coordina con el local.
                    </p>
                  )}
                  {!quotingDelivery && deliveryQuoteError && (
                    <p className="mt-1 text-xs text-amber-600">{deliveryQuoteError}</p>
                  )}
                  {!quotingDelivery && !addressConfirmed && !deliveryQuoteError && customer.address.trim() && (
                    <p className="mt-1 text-xs text-amber-600">
                      Elegí tu dirección de la lista de sugerencias para poder calcular el envío.
                    </p>
                  )}
                </>
              ) : (
                // Módulo DELIVERY_PRICING apagado: input de texto libre, sin
                // autocomplete ni cotización — fee fijo (resolvedDeliveryPrice
                // ya cae a DELIVERY_FEE cuando deliveryQuote es null).
                <input
                  ref={addressRef}
                  type="text"
                  value={customer.address}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomer((prev) => ({ ...prev, address: v, placeId: undefined }));
                    if (formError && v.trim() && /direcci[oó]n/i.test(formError)) setFormError("");
                  }}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-color)]"
                  placeholder="Ej: Av. Siempre Viva 742"
                />
              )}

              <label className="block text-sm mb-1 mt-3">Piso / Depto (opcional)</label>
              <input
                type="text"
                value={customer.addressUnit}
                onChange={(e) => setCustomer((prev) => ({ ...prev, addressUnit: e.target.value }))}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-color)]"
                placeholder="Ej: Piso 3, Depto B"
              />

              {deliveryQuote?.destinationLocation && (
                <div className="mt-3">
                  <DeliveryMap
                    destinationLocation={deliveryQuote.destinationLocation}
                    onLocationChange={handlePinDrag}
                  />
                </div>
              )}
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
                  <div key={it.uniqueId} className="flex items-stretch justify-between gap-3 py-1">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="text-sm font-semibold text-gray-900 leading-snug">
                        {it.name}
                      </p>
                      {(it.selectedOptions && it.selectedOptions.length > 0) || sizeLabel ? (
                        <p className="text-xs text-gray-500">
                          {it.selectedOptions && it.selectedOptions.length > 0
                            ? it.selectedOptions.map((o: any) => o.optionName).join(" + ")
                            : sizeLabel}
                        </p>
                      ) : null}
                      {it.observations?.trim() && (
                        <p className="text-xs text-gray-400 italic">Obs: {it.observations.trim()}</p>
                      )}
                    </div>
                    <div className="flex flex-col justify-between items-end shrink-0 pt-0.5">
                      <p className="text-sm font-bold text-gray-900 tabular-nums">
                        {fmt(it.finalPrice || it.price * it.quantity)}
                      </p>
                      {it.quantity > 1 && (
                        <span className="text-xs text-gray-400 tabular-nums">×{it.quantity}</span>
                      )}
                    </div>
                  </div>
                );
              }

              const main = comboData.comboItems?.find((x) => x.isMain);
              const extras = comboData.comboItems?.filter((x) => !x.isMain) || [];

              return (
                <div key={it.uniqueId} className="py-1">
                  <div className="flex items-stretch justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 leading-snug">{it.name}</p>
                        <span
                          className="inline-flex items-center text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full border leading-none shrink-0"
                          style={{
                            backgroundColor: "color-mix(in srgb, var(--brand-color) 10%, white)",
                            borderColor: "color-mix(in srgb, var(--brand-color) 30%, transparent)",
                            color: "var(--brand-color)"
                          }}
                        >
                          COMBO
                        </span>
                      </div>
                      {main && (
                        <div
                          className="pl-2 border-l-2 space-y-0.5 mt-0.5"
                          style={{ borderColor: "color-mix(in srgb, var(--brand-color) 35%, transparent)" }}
                        >
                          <p className="text-xs text-gray-600 leading-snug">
                            {main.name || "Producto"}
                            {(it.selectedOptions && it.selectedOptions.length > 0) || sizeLabel ? (
                              <span className="text-gray-400">
                                {" "}({it.selectedOptions && it.selectedOptions.length > 0
                                  ? it.selectedOptions.map((o: any) => o.optionName).join(" + ")
                                  : sizeLabel})
                              </span>
                            ) : null}
                            {main.qty && main.qty > 1 ? ` x${main.qty}` : ""}
                          </p>
                          {extras.length > 0 && (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              {extras.map((e, idx) => (
                                <span key={idx} className="text-xs text-gray-500">
                                  {e.name || "Ítem"}{e.qty && e.qty > 1 ? ` x${e.qty}` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {it.observations?.trim() && (
                        <p className="text-xs text-gray-400 italic pl-2">Obs: {it.observations.trim()}</p>
                      )}
                    </div>
                    <div className="flex flex-col justify-between items-end shrink-0 pt-0.5">
                      <p className="text-sm font-bold text-gray-900 tabular-nums">
                        {fmt(it.finalPrice || it.price * it.quantity)}
                      </p>
                      {it.quantity > 1 && (
                        <span className="text-xs text-gray-400 tabular-nums">×{it.quantity}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* FOOTER FIJO DENTRO DE LA CARD */}
          <div className="flex items-center justify-between border-t mt-3 pt-3 bg-white/0">
            <div className="w-full space-y-1.5">
              {/* Subtotal sin promo — solo si hay promo o delivery */}
              {(cartSummary || (deliveryMethod === "delivery" && resolvedDeliveryPrice > 0)) && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{fmt(cartSummary ? cartSummary.originalSubtotal : total)}</span>
                </div>
              )}
              {/* Descuento promo */}
              {cartSummary && (
                <div className="flex items-center justify-between text-sm" style={{ color: "var(--brand-color)" }}>
                  <span className="font-medium truncate pr-2">{cartSummary.promoName ?? "Descuento promo"}</span>
                  <span className="font-semibold shrink-0">−{fmt(cartSummary.savings)}</span>
                </div>
              )}
              {/* Envío */}
              {deliveryMethod === "delivery" && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Envío</span>
                  <span>
                    {deliveryQuote?.withinCoverage && deliveryQuote.price != null
                      ? fmt(deliveryQuote.price)
                      : resolvedDeliveryPrice > 0
                        ? fmt(resolvedDeliveryPrice)
                        : "A coordinar"}
                  </span>
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
                                    ${!storeOpen ? "opacity-60 cursor-not-allowed pointer-events-none" : ""}`
          } onClick={submitOrder} disabled={submitting || isRefreshing}>
            {isRefreshing ? "Verificando precios..." : submitting ? "Enviando..." : "Enviar Pedido"}
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
