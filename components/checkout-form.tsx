// components/checkout-form.tsx
"use client";

import { useRouter } from "next/navigation";
import { useCart, CartComboItem } from "@/components/cart-context";
import { Button } from "@/components/ui/button";
import { useRef, useEffect, useMemo, useState } from "react";
import { useOnlineConfig } from "@/lib/hooks/useOnlineConfig";
import { useBusinessStatusSmart } from "@/lib/hooks/useBusinessStatus";
import { useCartRefresh } from "@/hooks/useCartRefresh";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { DeliveryMap } from "@/components/delivery-map";
import { fetchDeliveryQuote, fetchDeliveryPricingEnabled, fetchDeliveryLocationBias, type DeliveryQuoteResponse } from "@/lib/api/delivery";
import { fetchLoyaltyEnabled, fetchLoyaltyStatus, fetchLoyaltyEarnPreview, type LoyaltyCustomerStatus } from "@/lib/api/loyalty";
import { fetchPublicPaymentMethods, type PublicPaymentMethod } from "@/lib/api/paymentMethods";
import { isWholesaleMode } from "@/lib/storeMode";
import { Sparkles, PartyPopper, Coins } from "lucide-react";
import { useTableOrder } from "@/components/table-order-context";

type Customer = {
  name: string;
  phone: string;
  address: string;
  addressUnit: string;
  placeId?: string;
  dni: string;
};

type Props = {
  onCancel?: () => void;
  onSuccess?: () => void;
};

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

const createClientRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

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
  const router = useRouter();
  const { items, getTotalPrice, clearCart } = useCart();
  const { config, isLoading: configLoading } = useOnlineConfig();
  const { data: businessStatus } = useBusinessStatusSmart();
  const {
    isTableMode,
    context: tableContext,
    loading: tableContextLoading,
    refresh: refreshTableContext,
  } = useTableOrder();
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
    dni: "",
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

  // Módulo LOYALTY: mismo patrón que DELIVERY_PRICING arriba — mientras no se
  // confirme habilitado, no se muestra nada de fidelización ni se gasta ningún
  // request. Reusa el mismo campo customer.dni que el modo wholesale (más
  // abajo) — son dos usos independientes del mismo dato: resolve-by-dni arma
  // el Order.customerId (facturación/mayorista), esto arma
  // Order.loyaltyCustomerId (fidelización). Deliberadamente separados en el
  // payload, igual que en el Backend — nunca uno como fallback del otro.
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  useEffect(() => {
    fetchLoyaltyEnabled().then(setLoyaltyEnabled);
  }, []);

  const [loyaltyStatus, setLoyaltyStatus] = useState<LoyaltyCustomerStatus | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const lastLoyaltyDniRef = useRef<string | null>(null);

  // Puntos a canjear: input local (string, mientras se tipea) + valor
  // confirmado (el que realmente viaja en el payload). Se aplica al perder
  // foco o con "Max", no en cada tecla — mismo criterio que hamburger-pos.
  const [puntosACanjearInput, setPuntosACanjearInput] = useState("");
  const [puntosACanjear, setPuntosACanjear] = useState(0);
  const [puntosAGanar, setPuntosAGanar] = useState(0);

  // Busca el estado de fidelización apenas el DNI es válido (7-8 dígitos).
  // No depende de isWholesaleMode() — un cliente normal también puede sumar/
  // canjear puntos sin necesitar cuenta de facturación mayorista.
  useEffect(() => {
    if (!loyaltyEnabled) {
      setLoyaltyStatus(null);
      return;
    }
    if (!isDniValid(customer.dni)) {
      setLoyaltyStatus(null);
      setPuntosACanjear(0);
      setPuntosACanjearInput("");
      lastLoyaltyDniRef.current = null;
      return;
    }
    const dniTrim = customer.dni.trim();
    if (lastLoyaltyDniRef.current === dniTrim) return; // ya se buscó este mismo DNI
    lastLoyaltyDniRef.current = dniTrim;

    let active = true;
    setLoyaltyLoading(true);
    // Sí mandamos nombre/teléfono ya tipeados en este pedido — pero solo tienen
    // efecto si el DNI es NUEVO (el Backend, buscarOCrearClientePorDni, ignora
    // datosContacto por completo cuando el Customer ya existe: no hay ninguna
    // verificación de que quien tipea el DNI sea su dueño real, así que nunca
    // se actualiza con esto, sin importar lo que mandemos acá — se protege del
    // lado seguro, no confiando en que el cliente no mande nada).
    fetchLoyaltyStatus(dniTrim, {
      name: customer.name.trim() || undefined,
      phone: normalizePhoneAR(customer.phone) || undefined,
    })
      .then((status) => { if (active) setLoyaltyStatus(status); })
      .catch(() => { if (active) setLoyaltyStatus(null); })
      .finally(() => { if (active) setLoyaltyLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.dni, loyaltyEnabled]);

  // Centro/radio para priorizar sugerencias del autocomplete cercanas a la
  // zona real de cobertura del comercio (ver AddressAutocomplete locationBias).
  const [deliveryLocationBias, setDeliveryLocationBias] = useState<{ latitude: number; longitude: number; radiusMeters: number } | null>(null);
  useEffect(() => {
    fetchDeliveryLocationBias().then(setDeliveryLocationBias);
  }, []);

  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "pickup" | null>(
    DELIVERY_ENABLED ? null : "pickup"
  );
  // Medios de pago configurados desde el admin (admin/tesoreria/metodos-de-pago,
  // "Visible en App Online") — reemplaza el hardcode "cash"|"mp" viejo, que
  // mandaba un paymentMethodCode inventado sin id real. Ver
  // openspec/changes/pedilo-medios-pago-config/.
  const [paymentMethods, setPaymentMethods] = useState<PublicPaymentMethod[]>([]);
  const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<number | null>(null);
  useEffect(() => {
    fetchPublicPaymentMethods().then((methods) => {
      setPaymentMethods(methods);
      setSelectedPaymentMethodId(methods.find((m) => m.isDefault)?.id ?? methods[0]?.id ?? null);
      setPaymentMethodsLoaded(true);
    });
  }, []);
  const [notes, setNotes] = useState("");
  // Solo se pide cuando esta comanda va a abrir la mesa sola (auto-apertura por
  // QR, ver tableGuestCount más abajo) — si ya hay una sesión (la abrió el
  // cajero o un pedido anterior), el número de personas ya está definido y no
  // tiene sentido volver a preguntarlo.
  const [tableGuestCount, setTableGuestCount] = useState(2);
  // Tope real: la capacidad de la mesa (el Backend vuelve a validar esto al
  // confirmar el pedido — ver processPublicCommand/table-service.service.ts).
  // 30 es solo un fallback mientras tableContext todavía no cargó.
  const tableGuestCountMax = tableContext?.table.capacity ?? 30;
  useEffect(() => {
    setTableGuestCount((current) => Math.min(current, tableGuestCountMax));
  }, [tableGuestCountMax]);

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
  const [dniTouched, setDniTouched] = useState(false);
  const [formError, setFormError] = useState<string>("");
  // En mesa, si el nombre ya estaba guardado de un pedido anterior en este
  // mismo navegador (checkout.customer en localStorage), no tiene sentido
  // volver a pedirlo en cada comanda — se muestra como texto, con opción de
  // cambiarlo por si en la práctica pide otra persona de la mesa.
  //
  // IMPORTANTE: nameLockedFromStorage se decide UNA SOLA VEZ al montar, a
  // partir de lo que realmente había en localStorage — nunca se recalcula a
  // partir de customer.name en cada render. Si se recalculara así, escribir
  // el primer carácter del nombre (que deja de estar vacío) lo bloquearía
  // solo, sin dejar terminar de escribir.
  const [nameLockedFromStorage, setNameLockedFromStorage] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const showNameAsLocked = isTableMode && nameLockedFromStorage && !editingName;
  // El primer disparo del efecto de guardado (en el mount) no debe pisar
  // localStorage con el estado inicial vacío de customer, antes de que el
  // efecto de carga (declarado antes, corre primero) termine de aplicar lo
  // leído — sino se pierde el nombre guardado en cada mount nuevo.
  const skipNextCustomerSaveRef = useRef(true);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const dniRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement | null>(null);

  const total = useMemo(() => getTotalPrice(), [getTotalPrice]);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  // Snapshot de fidelización al momento de confirmar — se congela acá (no se
  // sigue leyendo el estado en vivo) para que el cartel post-pedido muestre
  // siempre el número real de ESTE pedido, sin importar que después se
  // limpie el carrito/estado del formulario.
  const [confirmedLoyalty, setConfirmedLoyalty] = useState<{ ganados: number; canjeados: number; descuento: number } | null>(null);
  const tableRequestIdRef = useRef<string | null>(null);
  const orderingAllowed = isTableMode ? tableContext?.canOrder === true : storeOpen;
  // Esta comanda es la que va a abrir la mesa sola (auto-apertura por QR):
  // no hay sesión todavía, y este envío es justo lo que la crea.
  const willAutoOpenTable = isTableMode && tableContext?.state === "AVAILABLE" && tableContext?.canOrder === true;

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

  // ratioCanje no viaja directo en LoyaltyCustomerStatus — se deriva igual
  // que en hamburger-pos (LoyaltyCustomerLookup.tsx) a partir de los dos
  // valores que sí vienen: valorDescuentoDisponible / saldoEfectivo.
  // Viene directo del Backend (settings.ratioCanje) — antes se derivaba como
  // valorDescuentoDisponible/saldoEfectivo, que da 0/0 cuando el cliente
  // todavía no tiene puntos (justo el caso donde más útil es mostrarle
  // cuánto vale cada punto, para motivarlo a empezar a juntar).
  const loyaltyRatioCanje = loyaltyStatus?.ratioCanje ?? 0;
  const loyaltyDescuentoPreview = Math.round(puntosACanjear * loyaltyRatioCanje * 100) / 100;
  // Mensaje al cliente anclado en $1.000 de DESCUENTO (no en 1 punto crudo,
  // que con ratios chicos se ve feo — ej. "$0,01 por punto"): cuántos puntos
  // hacen falta para llegar a $1.000 de descuento.
  const loyaltyPuntosParaMilDeDescuento = loyaltyRatioCanje > 0 ? Math.ceil(1000 / loyaltyRatioCanje) : 0;
  // El descuento por puntos SOLO se aplica sobre el subtotal (productos) —
  // el envío nunca entra al cálculo de precios en el Backend (es un campo
  // puramente visual de OrderDeliveryInfo, no se suma a order.total). Sin
  // este tope acá, canjear más puntos de los que cubre el subtotal terminaba
  // "comiéndose" el envío en la preview (hasta mostrarlo gratis), aunque el
  // Backend jamás lo va a descontar así al confirmar el pedido.
  const loyaltyDescuentoAplicado = Math.min(loyaltyDescuentoPreview, total);

  // Descuento/recargo del medio de pago elegido — preview local (nunca
  // re-cotiza en vivo, mismo criterio que loyaltyDescuentoAplicado arriba):
  // se calcula sobre el subtotal ya neto de promo/puntos, sin envío (el
  // Backend tampoco lo aplica sobre el envío). El monto final autoritativo
  // lo recalcula el Backend al confirmar el pedido — ver
  // openspec/changes/pedilo-medios-pago-config/design.md.
  const selectedPaymentMethod = paymentMethods.find((m) => m.id === selectedPaymentMethodId) ?? null;
  const paymentMethodAdjustmentBase = Math.max(0, total - loyaltyDescuentoAplicado);
  const paymentMethodDiscountPreview = selectedPaymentMethod
    ? Math.round((paymentMethodAdjustmentBase * selectedPaymentMethod.discountPercent) / 100)
    : 0;
  const paymentMethodSurchargePreview = selectedPaymentMethod
    ? Math.round((paymentMethodAdjustmentBase * selectedPaymentMethod.surchargePercent) / 100)
    : 0;

  // Preview de "vas a sumar X puntos" con esta compra. Usa el subtotal YA
  // NETO del descuento por puntos, sin envío — es exactamente lo que el
  // Backend usa como montoOrden al acumular (Order.total = cartResult.total,
  // que nunca incluye el envío y ya viene neto de todos los descuentos,
  // fidelización incluida — ver acumularPuntos en loyalty.service.ts).
  const montoOrdenParaGanar = Math.max(0, total - loyaltyDescuentoAplicado);
  useEffect(() => {
    if (!loyaltyEnabled || !loyaltyStatus) {
      setPuntosAGanar(0);
      return;
    }
    let active = true;
    fetchLoyaltyEarnPreview(montoOrdenParaGanar)
      .then((p) => { if (active) setPuntosAGanar(p); })
      .catch(() => {});
    return () => { active = false; };
  }, [loyaltyEnabled, loyaltyStatus, montoOrdenParaGanar]);

  // Proyección para la barra de progreso debajo del Total: saldo actual +
  // lo que se gana con ESTE pedido, hacia el mínimo canjeable. Solo tiene
  // sentido mostrarla si el cliente todavía no puede canjear (si ya puede,
  // la barra de la caja de arriba ya está al 100% y esto sería redundante).
  const loyaltyProjectedSaldo = loyaltyStatus ? loyaltyStatus.saldoEfectivo + puntosAGanar : 0;
  const loyaltyProjectedPct = loyaltyStatus && loyaltyStatus.canjeMinimo > 0
    ? Math.min(100, Math.round((loyaltyProjectedSaldo / loyaltyStatus.canjeMinimo) * 100))
    : 0;
  const loyaltyWillUnlockRedeem = !!loyaltyStatus && !loyaltyStatus.puedeCanjear && loyaltyProjectedSaldo >= loyaltyStatus.canjeMinimo;

  // Confirma el canje (dispara el descuento en el preview local — el Backend
  // vuelve a validar/topear todo server-side al cotizar y al crear la orden,
  // esto es solo para mostrar el número mientras se arma el pedido).
  const applyPuntosACanjear = (value: number) => {
    if (!loyaltyStatus) return;
    const clamped = Math.min(Math.max(0, Math.floor(value) || 0), loyaltyStatus.saldoEfectivo);
    setPuntosACanjear(clamped);
  };

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
        if (typeof saved.name === "string" && saved.name.trim().length > 0) {
          setNameLockedFromStorage(true);
        }
      }
    } catch {
      // localStorage no disponible (ej. modo incógnito con storage bloqueado)
      // — simplemente no hay nada para precargar, se pide el nombre como siempre.
    }
  }, []);
  useEffect(() => {
    // El efecto de arriba (carga) corre antes que este en el mismo mount,
    // pero el setCustomer que dispara ahí no se refleja en `customer` hasta
    // el siguiente render — este primer disparo automático todavía ve el
    // estado inicial vacío. Sin este guard, se pisaría el localStorage recién
    // leído con "" apenas un instante después de haberlo leído.
    if (skipNextCustomerSaveRef.current) {
      skipNextCustomerSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem("checkout.customer", JSON.stringify(customer));
    } catch {
      // localStorage no disponible — el pedido sigue andando igual, solo no
      // se va a poder precargar el nombre en un próximo pedido de esta mesa.
    }
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

  // DNI argentino: se exige siempre 8 dígitos exactos (ni 7 ni más), a
  // propósito — reduce el universo de DNIs "adivinables" tipeando al azar
  // contra este campo (wholesale y fidelización comparten el mismo input).
  const isDniValid = (v: string) => /^\d{8}$/.test(v.trim());

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
    const selectedPaymentMethodName =
      paymentMethods.find((m) => m.id === selectedPaymentMethodId)?.name ?? "—";
    lines.push(`*Pago:* ${selectedPaymentMethodName}`);
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
    if (!isTableMode && !isPhoneValid(customer.phone)) {
      setPhoneTouched(true);
      const errorMsg = getPhoneErrorMessage(customer.phone);
      setFormError(errorMsg);
      phoneRef.current?.focus();
      phoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (isWholesaleMode() && !isDniValid(customer.dni)) {
      setDniTouched(true);
      setFormError("Ingresá un DNI válido (8 dígitos, sin puntos).");
      dniRef.current?.focus();
      dniRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // validar que eligió un método de envío
    if (!isTableMode && DELIVERY_ENABLED && deliveryMethod === null) {
      setFormError("Seleccioná un método de entrega: Delivery o Retiro en el local.");
      return;
    }
    // si es delivery, pedimos dirección
    if (!isTableMode && DELIVERY_ENABLED && deliveryMethod === "delivery" && !customer.address.trim()) {
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
    // Red de seguridad además del disabled del botón: mientras se está
    // calculando el envío no dejamos enviar, para que nunca quede un pedido
    // creado con envío "a coordinar con el local" cuando en realidad la
    // cotización todavía estaba en vuelo.
    if (DELIVERY_ENABLED && deliveryMethod === "delivery" && deliveryPricingEnabled && quotingDelivery) {
      setFormError("Estamos calculando el costo de envío, esperá un momento.");
      return;
    }
    // si eligió programar el pedido, validamos el horario (ayuda de UX — el backend vuelve a validar)
    if (!isTableMode && SCHEDULED_ORDERS_ENABLED && scheduleLater) {
      if (!scheduledTime) {
        setFormError("Elegí un horario para tu pedido.");
        return;
      }
      if (scheduledTime < minScheduledTime) {
        setFormError(`El horario debe tener al menos ${SCHEDULED_ORDERS_LEAD_MINUTES} minutos de anticipación.`);
        return;
      }
    }
    if (isTableMode && !tableContext?.canOrder) {
      setFormError(tableContext?.message || "La mesa no está habilitada para recibir pedidos.");
      await refreshTableContext();
      return;
    }
    if (!isTableMode && selectedPaymentMethodId == null) {
      setFormError("Elegí un medio de pago.");
      return;
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

      if (isTableMode) {
        const clientRequestId = tableRequestIdRef.current ?? createClientRequestId();
        tableRequestIdRef.current = clientRequestId;
        const response = await fetch("/api/table-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientRequestId,
            guestName: customer.name.trim(),
            notes: notes.trim() || null,
            items: itemsForApi,
            combos: combosForApi,
            ...(willAutoOpenTable ? { guestCount: tableGuestCount } : {}),
          }),
        });
        const responseText = await response.text();
        const parsed = (() => {
          try {
            return JSON.parse(responseText);
          } catch {
            return null;
          }
        })();
        if (!response.ok || !parsed?.success) {
          if (response.status === 409) await refreshTableContext();
          throw new Error(parsed?.error || "No se pudo enviar la comanda");
        }

        const trackingToken: string = parsed.data.trackingToken;
        tableRequestIdRef.current = null;
        clearCart();
        // El seguimiento solo tiene sentido con autoservicio activo (sin
        // KITCHEN) — ver selfServiceTracking en table-order-context.tsx. Sin
        // eso, el flujo vuelve directo al menú, como cualquier pedido de mesa.
        if (tableContext?.selfServiceTracking) {
          if (tableContext.table.code) {
            try {
              localStorage.setItem(`pedilo:table:${tableContext.table.code}:trackingToken`, trackingToken);
            } catch {
              // localStorage no disponible — el reconocimiento de "ya pedí" simplemente no aplica
            }
          }
          router.push(`/mesa-seguimiento/${trackingToken}`);
        } else {
          onSuccess?.();
        }
        return;
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

      // Modo wholesale: resolver/crear el Customer por DNI antes de armar el
      // pedido — el back necesita customerId para asociarlo (ver
      // openspec/changes/pedilo-wholesale-pickup/specs/customers/spec.md).
      // Si falla, no seguimos: sin customerId el pedido quedaría a nombre de
      // "Consumidor Final" en vez del cliente real.
      let resolvedCustomerId: number | undefined;
      if (isWholesaleMode()) {
        try {
          const dniRes = await fetch(`${BASE}/customers/resolve-by-dni`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dni: customer.dni.trim(),
              name: customer.name.trim(),
              phone: phoneNormalized,
            }),
          });
          if (!dniRes.ok) throw new Error(`HTTP ${dniRes.status}`);
          const dniJson = await dniRes.json();
          resolvedCustomerId = dniJson?.data?.id ?? dniJson?.id;
          if (!resolvedCustomerId) throw new Error("Respuesta sin id de cliente");
        } catch (err) {
          console.error("❌ No se pudo resolver el cliente por DNI", err);
          setFormError("No pudimos validar tu DNI. Revisalo e intentá de nuevo.");
          setSubmitting(false);
          return;
        }
      }

      const apiBodyRaw: any = {
        items: itemsForApi,
        combos: combosForApi,
        // Id real del medio de pago configurado en el admin — ya no se manda
        // un paymentMethodCode inventado (ver openspec/changes/pedilo-medios-pago-config/).
        paymentMethodId: selectedPaymentMethodId,
        amount_paid: Math.round(Number(total)),
        delivery_info,
        channel,                  // "WEB"
        fulfillment,              // "DELIVERY" | "TAKEAWAY"
        ...(resolvedCustomerId != null ? { customerId: resolvedCustomerId } : {}),
        // Fidelización — deliberadamente separado de customerId de arriba (ver
        // Order.loyaltyCustomerId en schema.prisma del Backend): aunque salgan
        // del mismo campo customer.dni acá, facturación/mayorista y
        // fidelización son selecciones independientes en la orden.
        ...(loyaltyStatus?.customerId != null ? { loyaltyCustomerId: loyaltyStatus.customerId } : {}),
        ...(puntosACanjear > 0 ? { loyaltyPointsToRedeem: puntosACanjear } : {}),
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

      // Fidelización: congelar el resultado de ESTE pedido para mostrarlo en
      // el cartel de confirmación (ver Requirement "Confirmación de puntos
      // ganados al cliente" — spec pide mostrarlo en la confirmación, no solo
      // en el preview previo a confirmar).
      if (loyaltyEnabled && loyaltyStatus) {
        setConfirmedLoyalty({
          ganados: puntosAGanar,
          canjeados: puntosACanjear,
          descuento: loyaltyDescuentoAplicado,
        });
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
      if (isTableMode) {
        setFormError(e instanceof Error ? e.message : "No se pudo enviar la comanda.");
      } else {
        alert("Ocurrió un error al procesar el pedido. Revisá consola.");
      }
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
        {!isTableMode && (
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
        )}

        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
          <div className="text-sm font-semibold mb-3">
            {isTableMode ? "¿Quién realiza el pedido?" : "Datos del cliente"}
          </div>

          <label className="block text-sm mb-1">{isTableMode ? "Nombre" : "Nombre y Apellido"}</label>
          {showNameAsLocked ? (
            <div className="mb-3 flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span className="truncate">{customer.name}</span>
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-[var(--brand-color)] hover:underline"
                onClick={() => setEditingName(true)}
              >
                Cambiar
              </button>
            </div>
          ) : (
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
          )}

          {willAutoOpenTable && (
            <>
              <label className="block text-sm mb-1">¿Cuántas personas son?</label>
              <div className="mb-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setTableGuestCount((current) => Math.max(1, current - 1))}
                  className="grid h-9 w-9 place-items-center rounded-md border text-lg font-semibold hover:bg-black/5"
                  aria-label="Restar persona"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm font-semibold tabular-nums">{tableGuestCount}</span>
                <button
                  type="button"
                  onClick={() => setTableGuestCount((current) => Math.min(tableGuestCountMax, current + 1))}
                  disabled={tableGuestCount >= tableGuestCountMax}
                  className="grid h-9 w-9 place-items-center rounded-md border text-lg font-semibold hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent"
                  aria-label="Sumar persona"
                >
                  +
                </button>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Esta mesa tiene capacidad para {tableGuestCountMax} personas.
              </p>
            </>
          )}

          {!isTableMode && (
          <>
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

          {/* DNI — mismo campo para dos usos independientes: modo wholesale
              (resolver/crear el Customer para facturación) y fidelización de
              puntos (siempre que el módulo LOYALTY esté activo, sin importar
              el modo). Se muestra si cualquiera de los dos aplica. */}
          {(isWholesaleMode() || loyaltyEnabled) && (
            <>
              <label className="block text-sm mb-1">
                {isWholesaleMode()
                  ? "DNI"
                  : (
                    <>
                      Colocá tu DNI para sumar puntos{" "}
                      <span className="font-normal text-muted-foreground">(opcional)</span>
                    </>
                  )}
              </label>
              <input
                ref={dniRef}
                id="dni-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 mb-1 ${
                  dniTouched && !isDniValid(customer.dni)
                    ? "border-red-500 focus:ring-red-400"
                    : "focus:ring-[var(--brand-color)]"
                }`}
                value={customer.dni}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setCustomer({ ...customer, dni: v });
                  if (formError && isDniValid(v)) setFormError("");
                }}
                onBlur={() => setDniTouched(true)}
                placeholder="Ej: 12345678"
                aria-invalid={dniTouched && !isDniValid(customer.dni)}
                aria-describedby="dni-help"
              />
              <p
                id="dni-help"
                className={`text-xs mb-3 ${
                  dniTouched && !isDniValid(customer.dni) ? "text-red-600" : "text-muted-foreground"
                }`}
              >
                {dniTouched && !isDniValid(customer.dni)
                  ? "El DNI debe tener 8 dígitos, sin puntos ni letras."
                  : isWholesaleMode()
                    ? "* Necesario para asociar tu pedido a tu cuenta de cliente."
                    : "Si no querés sumar puntos, podés dejarlo en blanco."}
              </p>

              {/* Fidelización — solo si el módulo está activo y ya hay un DNI válido.
                  Identidad visual propia (dorado/"secondary-highlight" del design
                  system de Pedilo) para que se lea como "moneda de puntos", separada
                  del resto del formulario — pero contenida a esta caja nada más
                  (Ten Percent Accent Rule del DESIGN.md: el acento no baña la pantalla). */}
              {loyaltyEnabled && isDniValid(customer.dni) && (
                <div className="mb-3 rounded-2xl border border-accent bg-accent/15 p-3.5 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-300">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-accent-foreground/70">
                    <Coins className="h-3.5 w-3.5" />
                    <span>Tus puntos</span>
                  </div>

                  {loyaltyPuntosParaMilDeDescuento > 0 && (
                    <p className="text-[11px] text-muted-foreground -mt-1">
                      Por cada {loyaltyPuntosParaMilDeDescuento.toLocaleString("es-AR")} puntos, canjeás {fmt(1000)} de descuento en tus próximos pedidos
                    </p>
                  )}

                  {loyaltyLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-accent-foreground/30 border-t-accent-foreground animate-spin" />
                      Buscando tus puntos…
                    </div>
                  )}

                  {!loyaltyLoading && loyaltyStatus && (
                    <>
                      {loyaltyStatus.puedeCanjear ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground text-sm font-extrabold px-3 py-1.5 shadow-sm">
                            <Sparkles className="h-3.5 w-3.5" />
                            {fmt(loyaltyStatus.valorDescuentoDisponible)} para descontar
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="font-medium">Tenés {loyaltyStatus.saldoEfectivo} puntos</span>
                            <span>Mínimo para canjear: {loyaltyStatus.canjeMinimo}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-black/5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-accent transition-all duration-500"
                              style={{
                                width: `${loyaltyStatus.canjeMinimo > 0
                                  ? Math.min(100, Math.round((loyaltyStatus.saldoEfectivo / loyaltyStatus.canjeMinimo) * 100))
                                  : 0}%`,
                              }}
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground/80">
                            Te faltan {loyaltyStatus.puntosFaltantesParaCanje} para poder canjear
                          </p>
                        </div>
                      )}

                      {loyaltyStatus.puedeCanjear && (
                        <div className="flex items-center gap-2 pt-0.5">
                          <input
                            type="number"
                            min={0}
                            max={loyaltyStatus.saldoEfectivo}
                            value={puntosACanjearInput}
                            onChange={(e) => setPuntosACanjearInput(e.target.value)}
                            onBlur={() => applyPuntosACanjear(Number(puntosACanjearInput) || 0)}
                            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                            placeholder={`Máx. ${loyaltyStatus.saldoEfectivo}`}
                            className="flex-1 rounded-lg border border-accent/50 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setPuntosACanjearInput(String(loyaltyStatus.saldoEfectivo));
                              applyPuntosACanjear(loyaltyStatus.saldoEfectivo);
                            }}
                            className="rounded-lg bg-accent text-accent-foreground text-sm font-bold px-3.5 py-2 shrink-0 shadow-sm hover:brightness-95 active:brightness-90 transition"
                          >
                            Max
                          </button>
                        </div>
                      )}

                      {puntosACanjear > 0 && (
                        <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <Coins className="h-3.5 w-3.5" />
                          Descuento aplicado: {fmt(loyaltyDescuentoAplicado)}
                          {loyaltyDescuentoAplicado < loyaltyDescuentoPreview && (
                            <span className="font-normal text-emerald-700/70">(topeado al subtotal)</span>
                          )}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}

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
          </>
          )}
        </div>



        {!isTableMode && (
        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
          <div className="text-sm font-semibold mb-3">Pago</div>
          {paymentMethods.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {paymentMethods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedPaymentMethodId(m.id)}
                  className={`px-3 py-2 rounded-lg border ${selectedPaymentMethodId === m.id
                    ? "border-[var(--brand-color)] bg-[#fff5f2]"
                    : "border-transparent hover:bg-black/5"
                    }`}
                >
                  {m.name}
                  {m.discountPercent > 0 && (
                    <span className="ml-1.5 text-xs font-semibold text-emerald-600">
                      -{m.discountPercent}%
                    </span>
                  )}
                  {m.surchargePercent > 0 && (
                    <span className="ml-1.5 text-xs font-semibold text-amber-600">
                      +{m.surchargePercent}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : paymentMethodsLoaded ? (
            <p className="text-sm text-muted-foreground">
              No hay medios de pago disponibles — contactá al local.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Cargando medios de pago…</p>
          )}
        </div>
        )}

        <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
          <div className="text-sm font-semibold mb-2">Observaciones</div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, CHECKOUT_NOTES_MAX))} // hard limit
            maxLength={CHECKOUT_NOTES_MAX}
            rows={2} // arranca chico
            placeholder={isTableMode
              ? "Ej. sin sal, cubiertos, pedido para compartir..."
              : "Usá este campo para indicar timbre roto, forma de pago, referencias del domicilio, etc."}
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
              {/* Puntos canjeados — se aplica SOLO sobre el subtotal, nunca sobre
                  el envío (que no forma parte del cálculo de precios del Backend,
                  ver comentario de loyaltyDescuentoAplicado arriba). Preview local:
                  el Backend recalcula/topea el descuento real al confirmar el
                  pedido, server-authoritative igual que el resto de esta pantalla. */}
              {puntosACanjear > 0 && (
                <div className="flex items-center justify-between text-sm" style={{ color: "var(--brand-color)" }}>
                  <span className="font-medium truncate pr-2">Puntos canjeados</span>
                  <span className="font-semibold shrink-0">−{fmt(loyaltyDescuentoAplicado)}</span>
                </div>
              )}
              {/* Envío — siempre a precio real, nunca afectado por el descuento de puntos */}
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
              {/* Descuento/recargo del medio de pago — preview local, ver
                  paymentMethodDiscountPreview/paymentMethodSurchargePreview
                  más arriba (nunca re-cotiza en vivo). */}
              {paymentMethodDiscountPreview > 0 && (
                <div className="flex items-center justify-between text-sm text-emerald-600">
                  <span className="font-medium truncate pr-2">Descuento ({selectedPaymentMethod?.name})</span>
                  <span className="font-semibold shrink-0">−{fmt(paymentMethodDiscountPreview)}</span>
                </div>
              )}
              {paymentMethodSurchargePreview > 0 && (
                <div className="flex items-center justify-between text-sm text-amber-600">
                  <span className="font-medium truncate pr-2">Recargo ({selectedPaymentMethod?.name})</span>
                  <span className="font-semibold shrink-0">+{fmt(paymentMethodSurchargePreview)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Total:</span>
                <span className="text-xl font-extrabold text-[var(--brand-color)]">
                  {fmt(
                    paymentMethodAdjustmentBase -
                    paymentMethodDiscountPreview +
                    paymentMethodSurchargePreview +
                    (deliveryMethod === "delivery" ? resolvedDeliveryPrice : 0)
                  )}
                </span>
              </div>
              {/* Puntos a ganar — separado a propósito de la caja de "Tus puntos"
                  de arriba (que es sobre el saldo/canje ya acumulado): esto es
                  sobre EL PEDIDO en curso, tiene más sentido pegado al total que
                  el cliente está por pagar. Si todavía no llega al mínimo
                  canjeable, se agrega la proyección: cuánto le va a quedar
                  DESPUÉS de sumar los puntos de esta compra, con su propia
                  barra de progreso — motiva a completar el pedido mostrando
                  qué tan cerca queda de poder canjear la próxima vez. */}
              {loyaltyEnabled && puntosAGanar > 0 && (
                <div className="pt-1 space-y-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 text-accent-foreground text-[11px] font-semibold px-2.5 py-1">
                      <Sparkles className="h-3 w-3" />
                      Sumás {puntosAGanar} {puntosAGanar === 1 ? "punto" : "puntos"} con esta compra
                    </span>
                  </div>

                  {loyaltyStatus && !loyaltyStatus.puedeCanjear && (
                    <div className="rounded-lg border border-accent/40 bg-accent/10 p-2 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Vas a tener {loyaltyProjectedSaldo} puntos</span>
                        <span>Mínimo: {loyaltyStatus.canjeMinimo}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-black/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent transition-all duration-500"
                          style={{ width: `${loyaltyProjectedPct}%` }}
                        />
                      </div>
                      {loyaltyWillUnlockRedeem && (
                        <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <PartyPopper className="h-3 w-3" />
                          ¡Con esta compra ya vas a poder canjear la próxima vez!
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
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
                                    ${!orderingAllowed ? "opacity-60 cursor-not-allowed pointer-events-none" : ""}`
          } onClick={submitOrder} disabled={submitting || isRefreshing || quotingDelivery || tableContextLoading || !orderingAllowed}>
            {isRefreshing
              ? "Verificando precios..."
              : quotingDelivery
                ? "Calculando envío..."
                : submitting
                  ? "Enviando..."
                  : isTableMode
                    ? `Enviar comanda a ${tableContext?.table.name || "la mesa"}`
                    : "Enviar Pedido"}
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
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center animate-in zoom-in-95 fade-in duration-300">
              {/* Fidelización — cartel de confirmación (ver Requirement "Confirmación
                  de puntos ganados al cliente" de la spec: debe mostrarse EN la
                  confirmación del pedido, no solo como preview antes de confirmar). */}
              {confirmedLoyalty && (confirmedLoyalty.ganados > 0 || confirmedLoyalty.canjeados > 0) && (
                <div className="mb-4 rounded-2xl border border-accent bg-accent/25 p-4 animate-in zoom-in-90 fade-in duration-500 delay-150">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm">
                    <PartyPopper className="h-6 w-6" strokeWidth={2.2} />
                  </div>
                  {confirmedLoyalty.ganados > 0 && (
                    <p className="text-base font-extrabold text-accent-foreground leading-snug">
                      ¡Ganaste {confirmedLoyalty.ganados} {confirmedLoyalty.ganados === 1 ? "punto" : "puntos"}!
                    </p>
                  )}
                  {confirmedLoyalty.canjeados > 0 && (
                    <p className={`flex items-center justify-center gap-1 text-xs text-accent-foreground/80 ${confirmedLoyalty.ganados > 0 ? "mt-1" : ""}`}>
                      <Coins className="h-3.5 w-3.5" />
                      Usaste {confirmedLoyalty.canjeados} {confirmedLoyalty.canjeados === 1 ? "punto" : "puntos"} · −{fmt(confirmedLoyalty.descuento)}
                    </p>
                  )}
                </div>
              )}

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
