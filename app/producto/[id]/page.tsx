// app/producto/[id]/page.tsx
"use client";

import SiteHeader from "@/components/site-header";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import ClosedBanner from "@/components/closed-banner";
import InfoBanner from "@/components/info-banner";
import { useOnlineConfig } from "@/lib/hooks/useOnlineConfig";
import { useBusinessStatusSmart } from "@/lib/hooks/useBusinessStatus";
import BlockingLoader from "@/components/blocking-loader";
import { fixImageUrl } from "@/lib/img";
import { fetchProductById, type Product, type ModifierGroup, type ModifierGroupOption } from "@/lib/api/products";
import { buildPromoLabel } from "@/lib/pricing";

// ===== Helpers de formato y cálculos =====
const MAX_NOTES = 50;
const fmt = (n?: number | string) => {
  const v = typeof n === "string" ? Number(n) : n;
  return typeof v === "number" && Number.isFinite(v)
    ? `$${v.toLocaleString("es-AR")}`
    : "-";
};
const toNum = (v: unknown) =>
  typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;

// ------- Warm cache helpers (sessionStorage) -------
const warmKey = (id: string | number) => `prefetch:product:${id}`;
function readWarmProduct(id: string | number): Product | null {
  try {
    const raw = sessionStorage.getItem(warmKey(id));
    if (!raw) return null;
    const p = JSON.parse(raw);
    // defensivo: dejamos solo lo básico
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      price: p.price,
      imageUrl: p.imageUrl,
      productOptions: Array.isArray(p.productOptions) ? p.productOptions : [],
      modifierGroups: Array.isArray(p.modifierGroups) ? p.modifierGroups : [],
      category: p.category,
    } as Product;
  } catch {
    return null;
  }
}

// Selección inicial: preselecciona las opciones marcadas isDefault en cada grupo.
function buildDefaultSelection(groups: ModifierGroup[]): Map<number, Set<number>> {
  const initial = new Map<number, Set<number>>();
  for (const group of groups) {
    const defaults = group.options.filter((o) => o.isDefault).map((o) => o.id);
    if (defaults.length > 0) initial.set(group.id, new Set(defaults));
  }
  return initial;
}

// ===== Helper local para cotizar (usa /pricing/quote si existe) =====
type QuoteItemProductView = {
  kind: "PRODUCT";
  productId: number;
  name: string;
  qty: number;
  unitListPrice: string;
  discountedUnitPrice: string;
  unitFinalPrice: string;
  lineTotal: string;
  options?: Array<{ id: number; name: string; extra: string }>;
  appliedPriceList?: {
    itemId: number;
    listName: string;
    listCode: string;
    priceType: string;
    value: string;
    savings: string;
  };
  appliedPromotion?: {
    name: string;
    priceType: string;
    savings: string;
  };
  comment?: string | null;
};

async function quoteProduct(
  productId: number,
  qty: number,
  optionIds: number[] = [],
  comment?: string
): Promise<QuoteItemProductView | null> {
  try {
    const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!BASE) return null;

    const body = {
      channel: "WEB",
      lines: [
        {
          type: "PRODUCT",
          product_id: productId,
          quantity: qty,
          option_ids: optionIds,
          comment: comment ?? null,
        },
      ],
    };

    const res = await fetch(`${BASE}/pricing/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const item = Array.isArray(json?.items) ? json.items[0] : null;
    if (!item || item.kind !== "PRODUCT") return null;
    return item as QuoteItemProductView;
  } catch {
    return null;
  }
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { addToCart } = useCart();

  const [justAdded, setJustAdded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data: status } = useBusinessStatusSmart();
  const { config: onlineConfig } = useOnlineConfig();
  // mientras carga: true => botón habilitado (si preferís bloquear hasta cargar, cambiá a !!status?.web.open)
  const isWebOpen = status?.web?.open ?? true;
  const pickupOnly = !!(status?.pos?.open && status?.web?.open === false);

  const disabledByStatus = !isWebOpen;


  const [prod, setProd] = useState<Product | null>(null);
  // Selección de modificadores: Map<modifierGroupId, Set<modifierOptionId>>
  const [selectedByGroup, setSelectedByGroup] = useState<Map<number, Set<number>>>(new Map());
  const [missingModifierGroupId, setMissingModifierGroupId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);

  // 💰 estados de cotización (promos)
  const [quotedUnit, setQuotedUnit] = useState<number | null>(null);
  const [quotedTotal, setQuotedTotal] = useState<number | null>(null);
  const [listUnit, setListUnit] = useState<number | null>(null);   // precio de lista (sin promo) por unidad
  const [hasPromo, setHasPromo] = useState(false);
  const [quoteIsFromPriceList, setQuoteIsFromPriceList] = useState(false);
  const [promoLabel, setPromoLabel] = useState<string | null>(null);

  // 0) al cambiar de producto (navegación cliente entre /producto/[id]), resetear
  //    ANTES de cualquier fetch. Sin esto, el botón "Agregar al Carrito" podía quedar
  //    habilitado mostrando todavía prod/selectedByGroup del producto ANTERIOR mientras
  //    se resuelve el nuevo — riesgo real en conexiones lentas (bug confirmado en
  //    producción para el caso análogo de combos).
  useEffect(() => {
    setProd(null);
    setSelectedByGroup(new Map());
    setLoading(true);
  }, [id]);

  // 1) al montar en el CLIENTE, intento leer el warm cache
  useEffect(() => {
    if (!id) return;
    const warm = readWarmProduct(id); // seguro: la función ya tiene try/catch
    if (warm) {
      setProd(warm);
      setSelectedByGroup(buildDefaultSelection(warm.modifierGroups ?? []));
      setLoading(false); // evita mostrar el loader si ya hay warm
    }
  }, [id]);

  // 2) fetch real (reemplaza o completa el warm)
  useEffect(() => {
    const BASE = process.env.NEXT_PUBLIC_API_URL;
    if (!id || !BASE) return;

    let aborted = false;
    (async () => {
      try {
        setLoading(true);
        const product: Product | null = await fetchProductById(id, { baseUrl: BASE });
        if (!product) throw new Error("not found");

        if (!aborted) {
          setProd(product);
          // Siempre defaults del producto recién cargado: nunca mantener selección
          // de un producto anterior (eso mezclaba modificadores entre productos).
          setSelectedByGroup(buildDefaultSelection(product.modifierGroups ?? []));
        }

        // refresco warm
        try { sessionStorage.setItem(warmKey(product.id), JSON.stringify(product)); } catch { }
      } catch {
        // si falla el fetch, no rompas el warm
      } finally {
        if (!aborted) setLoading(false);
      }
    })();

    return () => { aborted = true; };
    // ⚠️ importante incluir `prod` solo para la línea setLoading(prev...)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Grupos de modificadores del producto (ya vienen ordenados y filtrados por isActive)
  const groups = useMemo(() => prod?.modifierGroups ?? [], [prod]);

  // IDs de todas las opciones seleccionadas (todos los grupos)
  const allSelectedIds = useMemo(
    () => Array.from(selectedByGroup.values()).flatMap((s) => Array.from(s)),
    [selectedByGroup]
  );

  // Pares {group, option} de todo lo seleccionado, en el orden de los grupos/opciones
  const selectedEntries = useMemo(() => {
    const result: { group: ModifierGroup; option: ModifierGroupOption }[] = [];
    for (const group of groups) {
      const sel = selectedByGroup.get(group.id);
      if (!sel || sel.size === 0) continue;
      for (const opt of group.options) {
        if (sel.has(opt.id)) result.push({ group, option: opt });
      }
    }
    return result;
  }, [groups, selectedByGroup]);

  // Toggle de una opción respetando maxSelections (1 = radio, >1 = checkbox con tope) y minSelections
  const toggleOption = (group: ModifierGroup, optionId: number) => {
    if (missingModifierGroupId === group.id) setMissingModifierGroupId(null);
    setSelectedByGroup((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(group.id) ?? []);

      if (current.has(optionId)) {
        if (group.isRequired && current.size <= group.minSelections) return prev;
        current.delete(optionId);
      } else {
        if (group.maxSelections === 1) current.clear();
        if (current.size < group.maxSelections) current.add(optionId);
      }

      next.set(group.id, current);
      return next;
    });
  };

  // Labels de promo a mostrar en banner — siempre desde el catálogo (prod.activePromoLabels
  // para promos sin restricción de modificador + activatesPromo por opción para las
  // restringidas a un modificador puntual). Nunca desde el endpoint genérico de
  // /price-lists/active-promos: ese es exclusivo de home/categorías (PromoBanner).
  const promoBannerLabels = useMemo(() => {
    const labels: string[] = [];
    const seen = new Set<string>();

    for (const label of prod?.activePromoLabels ?? []) {
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
    }

    const allOpts = groups.flatMap((g) => g.options);
    const modifierLabel = allOpts.find((o) => o.activatesPromo)?.activatesPromo?.label ?? null;
    if (modifierLabel && !seen.has(modifierLabel)) {
      seen.add(modifierLabel);
      labels.push(modifierLabel);
    }

    return labels;
  }, [prod?.activePromoLabels, groups]);

  // cálculo local (fallback)
  const base = toNum(prod?.price);
  const optionsExtraTotal = selectedEntries.reduce((sum, { option }) => sum + toNum(option.precio_extra), 0);
  const localTotal = (base + optionsExtraTotal) * qty;

  // 🔁 Cotizar en el back (promos) cada vez que cambian qty / opciones / producto
  useEffect(() => {
    (async () => {
      if (!prod?.id) {
        setQuotedUnit(null);
        setQuotedTotal(null);
        return;
      }
      const qres = await quoteProduct(Number(prod.id), Math.max(1, qty || 1), allSelectedIds, notes?.trim() || undefined);

      if (qres) {
        const unit = Number(qres.unitFinalPrice);
        const tot = Number(qres.lineTotal);
        const list = Number(qres.unitListPrice);
        if (Number.isFinite(unit) && Number.isFinite(tot)) {
          setQuotedUnit(unit);
          setQuotedTotal(tot);
          setListUnit(Number.isFinite(list) ? list : null);
          setHasPromo(!!(qres.appliedPriceList || qres.appliedPromotion));
          setQuoteIsFromPriceList(!!qres.appliedPriceList && !qres.appliedPromotion);
          setPromoLabel(
            qres.appliedPriceList ? qres.appliedPriceList.listName :
              qres.appliedPromotion ? qres.appliedPromotion.name : null
          );
          return;
        }
      }
      // fallback local si la cotización falla/no aplica
      const unitLocal = base + optionsExtraTotal;
      setQuotedUnit(unitLocal);
      setQuotedTotal(unitLocal * qty);
      setHasPromo(false);
      setQuoteIsFromPriceList(false);
      setPromoLabel(null);
      setListUnit(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prod?.id, qty, allSelectedIds.join(",")]);

  const handleAdd = async () => {
    if (!prod) return;
    if (submitting) return; // 🔒 Prevenir doble click

    // Validar que todos los grupos obligatorios cumplan su mínimo de selecciones
    const missingGroup = groups.find((g) => {
      if (!g.isRequired) return false;
      const sel = selectedByGroup.get(g.id);
      return (sel?.size ?? 0) < g.minSelections;
    });
    if (missingGroup) {
      setMissingModifierGroupId(missingGroup.id);
      return;
    }

    // IMPORTANTE: Capturar los valores ANTES de cualquier estado asíncrono
    const currentSelectedEntries = [...selectedEntries];
    const currentQty = qty;
    const currentNotes = notes;
    const currentOptionIds = currentSelectedEntries.map(({ option }) => Number(option.id));

    // usar cotización ya calculada (si está), con fallback
    let unit = quotedUnit;
    let total = quotedTotal;

    if (unit == null || total == null) {
      const qres = await quoteProduct(
        Number(prod.id),
        Math.max(1, currentQty || 1),
        currentOptionIds,
        currentNotes?.trim() || undefined
      );
      if (qres) {
        const u = Number(qres.unitFinalPrice);
        const t = Number(qres.lineTotal);
        if (Number.isFinite(u) && Number.isFinite(t)) {
          unit = u;
          total = t;
        }
      }
      if (unit == null || total == null) {
        // último fallback local
        const baseNum =
          typeof prod.price === "string" ? Number(prod.price) : (prod.price ?? 0);
        const extrasNum = currentSelectedEntries.reduce(
          (sum, { option }) => sum + toNum(option.precio_extra),
          0
        );
        unit = baseNum + extrasNum;
        total = unit * currentQty;
      }
    }

    // Construir array de opciones seleccionadas (todos los grupos)
    const selectedOptionsArr = currentSelectedEntries.map(({ group, option }) => ({
      productOptionId: Number(option.id),
      optionId: Number(option.id),
      optionName: option.name || "",
      tipo: group.name || "Modificador",
      priceExtra: toNum(option.precio_extra),
    }));

    setSubmitting(true); // 🔒 Bloquear mientras se procesa

    addToCart({
      uniqueId: `${prod.id}-${currentOptionIds.join("-")}-${Date.now()}`,
      id: Number(prod.id) || 0,
      name: prod.name || "",
      description: prod.description || "",
      price: unit,                 // 💰 unitario efectivo
      finalPrice: total,           // 💰 total efectivo
      image: prod.imageUrl || "",
      category: "",
      quantity: currentQty,
      observations: currentNotes,
      selectedOptions: selectedOptionsArr.length > 0 ? selectedOptionsArr : undefined,
      isDefaultCategory: false,
    });

    setJustAdded(true);
    setTimeout(() => {
      setJustAdded(false);
      setSubmitting(false);
      router.back();
    }, 600);
    setNotes("");
    setQty(1);
    // Restaurar selección a los defaults de cada grupo
    setSelectedByGroup(buildDefaultSelection(groups));
    setMissingModifierGroupId(null);
  };

  // ⬇️ Render SIEMPRE; overlay solo si no hubo warm
  return (
    <div className="bg-background relative">
      <SiteHeader
        showBack
        onBack={() => router.back()}
        onCartClick={() => router.push("/carrito")}
      />
      <div className="h-[6px] w-full bg-white" />
      <ClosedBanner />
      <InfoBanner />

      {!prod && !loading ? (
        <div className="mx-auto w-full max-w-6xl p-4">
          No se encontró el producto.
        </div>
      ) : (
        <div className="mx-auto w-full max-w-6xl p-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Izquierda */}
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 bg-white/60">
              <div className="relative w-full aspect-[4/3]">
                <Image
                  src={fixImageUrl(prod?.imageUrl) || "/placeholder.svg"}
                  alt={prod?.name || "Producto"}
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>

            <h2 className="text-xl font-extrabold uppercase">
              {prod?.name ?? "…"}
            </h2>

            {prod?.description && (
              <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3 text-sm text-muted-foreground">
                {prod.description}
              </div>
            )}
          </div>

          {/* Derecha */}
          <div className="space-y-4">
            {/* Banner de promos disponibles para este producto */}
            {promoBannerLabels.map((label) => (
              <div key={label} className="rounded-xl bg-green-50 ring-1 ring-green-200 px-3 py-2 flex items-center gap-2">
                <span className="text-base leading-none">🏷️</span>
                <span className="text-sm font-semibold text-green-700">{label}</span>
              </div>
            ))}

            {/* Grupos de modificadores (N genéricos: Tamaño, Salsa, Acompañamiento, Extras, etc.) */}
            {groups.map((group) => {
              const isRadio = group.maxSelections === 1;
              const sel = selectedByGroup.get(group.id) ?? new Set<number>();
              const hasError = missingModifierGroupId === group.id;

              return (
                <div
                  key={group.id}
                  className={[
                    "rounded-2xl ring-1 bg-white/60 p-3 space-y-2",
                    hasError ? "ring-red-400 bg-red-50/70" : "ring-black/5",
                  ].join(" ")}
                >
                  <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    {group.name}
                    {group.isRequired && <span className="text-red-500">*</span>}
                    <span className="text-xs font-normal text-muted-foreground">
                      {group.isRequired
                        ? isRadio
                          ? "(obligatorio - elige una)"
                          : `(obligatorio - mín ${group.minSelections})`
                        : isRadio
                          ? "(opcional - elige una)"
                          : `(opcional - hasta ${group.maxSelections})`}
                    </span>
                  </div>
                  {group.options.map((o) => {
                    const active = sel.has(o.id);
                    const plus = toNum(o.precio_extra);
                    return (
                      <div
                        key={String(o.id)}
                        onClick={() => toggleOption(group, o.id)}
                        role={isRadio ? "radio" : "checkbox"}
                        aria-checked={active}
                        className={[
                          "w-full rounded-lg border px-3 py-2 cursor-pointer flex items-center justify-between transition-colors",
                          active
                            ? "border-[var(--brand-color)] bg-[#fff5f2]"
                            : "border-transparent hover:bg-black/5",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-3">
                          {!isRadio && (
                            <Checkbox checked={active} onCheckedChange={() => { }} className="pointer-events-none" />
                          )}
                          <span className="text-sm flex items-center gap-1.5">
                            {o.name || "Opción"}
                            {o.activatesPromo && (
                              <span className="text-[10px] font-bold bg-green-100 text-green-700 rounded px-1.5 py-0.5 leading-none">
                                PROMO
                              </span>
                            )}
                          </span>
                        </div>
                        <span className="text-sm font-semibold">
                          {plus ? `+${fmt(plus)}` : isRadio ? "" : "Gratis"}
                        </span>
                      </div>
                    );
                  })}
                  {hasError && (
                    <p className="text-xs font-medium text-red-600">
                      {group.minSelections > 1
                        ? `Debés seleccionar al menos ${group.minSelections} opciones.`
                        : "Debés seleccionar una opción."}
                    </p>
                  )}
                </div>
              );
            })}

            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
              <div className="text-sm font-semibold mb-2">Cantidad:</div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={loading && !prod}
                >
                  −
                </Button>
                <div className="w-8 text-center font-semibold">{qty}</div>
                <Button
                  variant="outline"
                  onClick={() => setQty((q) => q + 1)}
                  disabled={loading && !prod}
                >
                  ＋
                </Button>
              </div>
            </div>

            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
              <div className="text-sm font-semibold mb-2">Observaciones:</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES))}
                maxLength={MAX_NOTES}
                rows={2}
                placeholder="Escribe aquí cualquier observación especial para tu pedido..."
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-color)] resize-none min-h-[40px]"
                onInput={(e) => {
                  const ta = e.currentTarget;
                  ta.style.height = "auto";
                  ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
                }}
                disabled={loading && !prod}
              />
              <div className="mt-1 text-xs text-muted-foreground text-right">
                {notes.length}/{MAX_NOTES}
              </div>
            </div>

            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">Total:</div>
                <div className="text-right">
                  {/* Precio de lista tachado: aparece cuando hay descuento (lista PRICING o promo PROMOTION) */}
                  {listUnit != null && listUnit !== quotedUnit && (
                    <div className="text-sm text-muted-foreground line-through">
                      {fmt(listUnit * qty)}
                    </div>
                  )}
                  <div className="text-xl font-extrabold text-[var(--brand-color)]">
                    {fmt(quotedTotal ?? localTotal)}
                  </div>
                  {/* Aclaración de descuento aplicado */}
                  {(hasPromo || (listUnit != null && listUnit !== quotedUnit)) && (
                    <div className="text-[11px] text-green-700 font-medium">
                      {quoteIsFromPriceList ? "Precio con descuento aplicado" : "Precio promo aplicado"}
                    </div>
                  )}
                </div>
              </div>
              <Button
                className={`w-full text-white transition-colors
                  bg-[var(--brand-color)]
                  hover:bg-[color-mix(in_srgb,var(--brand-color),#000_12%)]
                  active:bg-[color-mix(in_srgb,var(--brand-color),#000_18%)]
                  hover:brightness-95 active:brightness-90
                  disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none`}
                onClick={isWebOpen ? handleAdd : undefined}
                disabled={disabledByStatus || !prod || submitting}
                title={
                  disabledByStatus
                    ? (pickupOnly ? "Solo tomamos pedidos en el local." : onlineConfig.closedMessage)
                    : undefined
                }
                aria-disabled={disabledByStatus || !prod || submitting}
              >
                {disabledByStatus
                  ? (pickupOnly ? "Solo en el local" : "Local cerrado")
                  : (justAdded ? "Agregado ✔" : "Agregar al Carrito")}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Overlay bloqueante solo si no teníamos warm */}
      <BlockingLoader open={loading} message="Cargando producto…" />
    </div>
  );
}
