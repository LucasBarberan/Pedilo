// app/combos/[slug]/page.tsx
"use client";

import SiteHeader from "@/components/site-header";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useCart } from "@/components/cart-context";
import ClosedBanner from "@/components/closed-banner";
import InfoBanner from "@/components/info-banner";
import { useOnlineConfig } from "@/lib/hooks/useOnlineConfig";
import { useBusinessStatusSmart } from "@/lib/hooks/useBusinessStatus";
import { fixImageUrl } from "@/lib/img";
import BlockingLoader from "@/components/blocking-loader";
import { isAllowedForDelivery } from "@/lib/channel";
import type { Combo as ApiCombo, ComboCategoryInclusion as CategoryInclusion, ComboSlotExpanded, SlotSelection } from "@/lib/api/combos";
import type { Product as ApiProduct, ModifierGroup, ModifierGroupOption } from "@/lib/api/products";
import { quoteCombo, quoteComboSlots, buildPromoLabel, type QuoteComboItem, type QuoteComboSlotInput, type QuoteComboInclusionInput } from "@/lib/pricing";
import { useHideLayoutFooter } from "@/components/layout-shell";
import { useTableOrder } from "@/components/table-order-context";

const MAX_NOTES = 50;

type ComboDetailPageProps = {
  combo: ApiCombo;
  mainProduct: ApiProduct | null;
  inclusionProducts: Record<string, ApiProduct[]>;
};

// ===== Helpers =====
const toNum = (v: unknown) =>
  typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;

const toNumber = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? (n as number) : null;
};

const fmt = (n?: number | string | null) => {
  if (n === null || n === undefined) return "-";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "-";
  const rounded = Math.ceil(v as number);
  return `$${rounded.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const capitalizeFirst = (value: string) => {
  const text = value.trim();
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// ===== Helpers stepper de slots =====

function buildEmptySlotSelection(slot: ComboSlotExpanded, overrideByOptionId?: Map<number, { isEnabled: boolean }>): SlotSelection {
  const selectedByGroup = new Map<number, Map<number, number>>();
  for (const group of slot.product.modifierGroups) {
    const visibleOptions = group.options.filter(
      (o) => overrideByOptionId?.get(o.id)?.isEnabled !== false
    );
    // Grupos requeridos siempre necesitan algo seleccionado (default o, si no hay, la
    // primera opción visible). Grupos opcionales solo se precompletan si tienen un
    // default explícito — mismo criterio que buildDefaultSelection (combo simple).
    const defaultOpt = visibleOptions.find((o) => o.isDefault) ?? (group.isRequired ? visibleOptions[0] : undefined);
    if (defaultOpt) {
      selectedByGroup.set(group.id, new Map([[defaultOpt.id, 1]]));
    }
  }
  return {
    comboItemId: slot.comboItemId,
    slotIndex: slot.slotIndex,
    selectedByGroup,
    comment: "",
  };
}

function validateSlotSelection(slot: ComboSlotExpanded, sel: SlotSelection): number[] {
  const errors: number[] = [];
  for (const group of slot.product.modifierGroups) {
    if (!group.isRequired) continue;
    const chosen = sel.selectedByGroup.get(group.id);
    const count = chosen ? Array.from(chosen.values()).filter((q) => q > 0).length : 0;
    if (count < (group.minSelections ?? 1)) errors.push(group.id);
  }
  return errors;
}

// Serializa un Map<optionId, qty> a options:[{id,qty}] (solo entradas con qty>0),
// listo para mandar al backend (quote u orden).
function slotSelectedByGroupToOptions(selectedByGroup: Map<number, Map<number, number>>): { id: number; qty: number }[] {
  return Array.from(selectedByGroup.values()).flatMap((qtyMap) =>
    Array.from(qtyMap.entries())
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ id, qty }))
  );
}

// ===== Selección inicial legacy =====

// Selección inicial: preselecciona las opciones marcadas isDefault en cada grupo.
function buildDefaultSelection(groups: ModifierGroup[]): Map<number, Map<number, number>> {
  const initial = new Map<number, Map<number, number>>();
  for (const group of groups) {
    const defaults = group.options.filter((o) => o.isDefault);
    if (defaults.length > 0) {
      const qtyMap = new Map<number, number>();
      for (const o of defaults) qtyMap.set(o.id, 1);
      initial.set(group.id, qtyMap);
    }
  }
  return initial;
}

// Reparte includedFreeCount entre las opciones seleccionadas de un grupo: las de menor
// precio_extra consumen el cupo gratis primero (empate por sortOrder), igual que
// buildComboOptionSnapshotsWithFreeCount en el Backend. Devuelve unidades gratis por optionId.
function computeFreeUnitsByOption(
  group: ModifierGroup,
  qtyMap: Map<number, number>,
  freeCount: number
): Map<number, number> {
  const freeUnitsByOptionId = new Map<number, number>();
  if (freeCount <= 0) return freeUnitsByOptionId;

  const selected = group.options
    .map((o) => ({ id: o.id, qty: qtyMap.get(o.id) ?? 0, precioExtra: toNum(o.precio_extra), sortOrder: o.sortOrder ?? 0 }))
    .filter((o) => o.qty > 0)
    .sort((a, b) => a.precioExtra - b.precioExtra || a.sortOrder - b.sortOrder);

  let freeUnitsUsed = 0;
  for (const o of selected) {
    const freeForThis = Math.max(0, Math.min(o.qty, freeCount - freeUnitsUsed));
    freeUnitsUsed += freeForThis;
    if (freeForThis > 0) freeUnitsByOptionId.set(o.id, freeForThis);
  }
  return freeUnitsByOptionId;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const priceWithInclusionRule = (
  baseItemPrice: number | null,
  r: CategoryInclusion
): number | null => {
  if (baseItemPrice === null) return null;
  const base = baseItemPrice;

  switch (r?.pricingMode) {
    case "INCLUDED_FREE":
      return 0;
    case "PERCENT_DISCOUNT": {
      const pct = Number(r.percentOff ?? 0) / 100;
      return round2(base * (1 - pct));
    }
    case "FIXED_DISCOUNT": {
      const off = Number(r.amountOff ?? 0);
      return round2(Math.max(0, base - off));
    }
    case "PRICE_CAP": {
      const cap = r.priceCap != null ? Number(r.priceCap) : null;
      if (!Number.isFinite(cap as number)) return round2(base);
      if (base <= (cap as number)) return round2(base);
      return r.surchargeIfAboveCap ? round2(base) : round2(cap as number);
    }
    case "FIXED_PRICE": {
      const fixed = Number(r.fixedPrice ?? 0);
      return round2(fixed);
    }
    default:
      return round2(base);
  }
};
const priceWithInclusionRuleAndPromo = (
  baseItemPrice: number | null,
  r: CategoryInclusion,
  factor: number
): number | null => {
  const ruled = priceWithInclusionRule(baseItemPrice, r);
  if (ruled === null) return null;
  return round2(ruled * factor);
};

export default function ComboDetailPage({ combo: initialCombo, mainProduct: initialMainProduct, inclusionProducts: initialInclusionProducts }: ComboDetailPageProps) {
  const router = useRouter();
  const { addToCart } = useCart();

  // ---------- Estado base ----------
  const combo = initialCombo;
  // modifierGroups ya viene ordenado (por sortOrder de grupo y de opción) desde lib/api/products.ts
  const mainProduct = initialMainProduct;

  const inclusionsProducts = initialInclusionProducts;

  // Overrides específicos del combo: pueden ocultar una opción o reemplazar su extra.
  const modifierOverrideByOptionId = useMemo(() => {
    return new Map(
      (combo?.modifierOverrides ?? []).map((ov) => [Number(ov.modifierOptionId), ov])
    );
  }, [combo?.modifierOverrides]);

  // Reglas de includedFreeCount del ítem principal: viajan en combo.slots[] (mismo dato que
  // usa el stepper de slots), aunque este formulario "simple" no use el stepper — se busca
  // el slot cuyo comboItemId coincide con el ComboItem principal (isMain).
  const mainItemModifierGroupRules = useMemo(() => {
    const mainItemId = combo?.items?.find((i) => i.isMain)?.id;
    if (mainItemId == null) return [];
    const mainSlot = (combo?.slots ?? []).find((s) => Number(s.comboItemId) === Number(mainItemId));
    return mainSlot?.modifierGroupRules ?? [];
  }, [combo?.items, combo?.slots]);

  // Grupos de modificadores del producto principal (N genéricos), respetando los
  // overrides del combo: se excluyen opciones deshabilitadas, se aplica extraOverride
  // y se remueven grupos que quedan sin opciones tras el filtro.
  const groups = useMemo<ModifierGroup[]>(() => {
    const rawGroups = mainProduct?.modifierGroups ?? [];

    return rawGroups
      .map((g) => ({
        ...g,
        options: g.options
          .filter((o) => modifierOverrideByOptionId.get(o.id)?.isEnabled !== false)
          .map((o) => {
            const override = modifierOverrideByOptionId.get(o.id);
            return override?.extraOverride != null
              ? { ...o, precio_extra: override.extraOverride }
              : o;
          }),
      }))
      .filter((g) => g.options.length > 0);
  }, [mainProduct, modifierOverrideByOptionId]);

  // Selección de modificadores del producto principal: Map<modifierGroupId, Map<modifierOptionId, qty>>
  // Se inicializa sincrónicamente con los defaults (lazy initializer) para que el primer
  // render ya tenga la selección correcta: mainProduct.modifierGroups llega resuelto desde
  // el Server Component, sin fetch pendiente, así que no hace falta esperar a un useEffect
  // post-render — eso dejaba una ventana donde un click inmediato en "Agregar al Carrito"
  // mandaba el item sin opciones (bug confirmado en producción, ~3 casos en miles).
  const [selectedByGroup, setSelectedByGroup] = useState<Map<number, Map<number, number>>>(
    () => buildDefaultSelection(groups)
  );
  const [missingModifierGroupId, setMissingModifierGroupId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [justAdded, setJustAdded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openIncId, setOpenIncId] = useState<string | null>(null);
  const [inclusionSelections, setInclusionSelections] = useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    for (const inc of combo?.categoryInclusions ?? []) {
      map[String(inc.id)] = [];
    }
    return map;
  });
  const [inclusionErrors, setInclusionErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Mismas selecciones, en el formato que espera /pricing/quote (inclusion_id + product_ids) —
  // necesario para que el subtotal en vivo del stepper refleje reglas de precio ligadas a la
  // inclusión elegida (PRICE_CAP, % descuento, etc.), no solo las opciones de modificadores.
  const inclusionSelectionsForQuote = useMemo((): QuoteComboInclusionInput[] => {
    return Object.entries(inclusionSelections)
      .filter(([, pids]) => pids.length > 0)
      .map(([incId, pids]) => ({ inclusion_id: Number(incId), product_ids: pids.map(Number) }));
  }, [inclusionSelections]);

  // 💰 subtotal en tiempo real del stepper (quote del servidor)
  const [slotSubtotal, setSlotSubtotal] = useState<number | null>(null);

  // 💰 precios cotizados por el servidor (por unidad de combo)
  const [quotedEffective, setQuotedEffective] = useState<number | null>(null);
  const [quotedList, setQuotedList] = useState<number | null>(null);
  const [quoteHasPromo, setQuoteHasPromo] = useState(false);
  const [quoteIsFromPriceList, setQuoteIsFromPriceList] = useState(false);
  const [promoLabel, setPromoLabel] = useState<string | null>(null);

  // Igual que en producto: estado comercial
  const { data: status } = useBusinessStatusSmart();
  const { config: onlineConfig } = useOnlineConfig();
  const { isTableMode, context: tableContext, loading: tableLoading } = useTableOrder();
  const isWebOpen = status?.web?.open ?? true; // mientras carga, asumimos abierto
  const pickupOnly = !!(status?.pos?.open && status?.web?.open === false);
  const orderingEnabled = isTableMode ? tableContext?.canOrder === true : isWebOpen;
  const disabledByStatus = !orderingEnabled || (isTableMode && tableLoading);

  const loading = false; // si en tu caso hay fetch para combo, actualizá este flag

  // ===== Estado stepper de slots =====
  // Solo cuentan los slots cuyo producto tiene grupos de modificadores configurados — un ítem fijo
  // sin modificadores (ej. papas fritas) no amerita un paso del wizard. Si sólo hay 1 ítem con
  // modificadores en todo el combo, se usa la forma original (mainProduct + inclusiones inline),
  // no el stepper — el stepper es para cuando hay más de un ítem a configurar.
  const slots: ComboSlotExpanded[] = (combo?.slots ?? []).filter(
    (s) => (s.product?.modifierGroups?.length ?? 0) > 0
  );
  const hasSlotModifiers = slots.length > 1;
  const hasInclusions = (combo?.categoryInclusions?.length ?? 0) > 0;
  const totalSlotSteps = slots.length + (hasInclusions ? 1 : 0);

  // Ocultar el footer de LayoutShell cuando el stepper está activo (experiencia full-screen en mobile)
  useHideLayoutFooter(hasSlotModifiers);

  const slotScrollRef = useRef<HTMLDivElement>(null);
  const [slotStep, setSlotStep] = useState(0);
  const [slotSelections, setSlotSelections] = useState<SlotSelection[]>(() => {
    const overrideMap = new Map((initialCombo?.modifierOverrides ?? []).map((ov) => [Number(ov.modifierOptionId), ov]));
    return slots.map((s) => buildEmptySlotSelection(s, overrideMap));
  });
  const [slotGroupErrors, setSlotGroupErrors] = useState<Set<number>>(new Set());

  const isSlotStepActive = slotStep < slots.length;
  const currentSlot = isSlotStepActive ? slots[slotStep] : null;
  const currentSlotSel = isSlotStepActive ? slotSelections[slotStep] : null;
  const isInclusionStep = !isSlotStepActive && hasInclusions;

  // Reset stepper cuando cambia el combo
  useEffect(() => {
    if (!hasSlotModifiers) return;
    setSlotStep(0);
    const overrideMap = new Map((combo?.modifierOverrides ?? []).map((ov) => [Number(ov.modifierOptionId), ov]));
    setSlotSelections(slots.map((s) => buildEmptySlotSelection(s, overrideMap)));
    setSlotGroupErrors(new Set());
  }, [combo?.id, hasSlotModifiers]);

  // Cotizar subtotal en tiempo real mientras el usuario elige opciones en el stepper
  useEffect(() => {
    if (!hasSlotModifiers || !combo?.id) return;
    const ctrl = new AbortController();
    const slotInputs: QuoteComboSlotInput[] = slotSelections.map((sel) => {
      const options = slotSelectedByGroupToOptions(sel.selectedByGroup);
      return {
        combo_item_id: sel.comboItemId,
        slot_index: sel.slotIndex,
        option_ids: options.map((o) => o.id),
        options,
      };
    });
    quoteComboSlots({
      comboId: Number(combo.id),
      qty: 1,
      slots: slotInputs,
      inclusionSelections: inclusionSelectionsForQuote,
      signal: ctrl.signal,
    })
      .then((result) => {
        if (result) setSlotSubtotal(Number(result.breakdown.effectivePerCombo));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [hasSlotModifiers, combo?.id, slotSelections, inclusionSelectionsForQuote]);

  const toggleSlotOption = (groupId: number, optionId: number, maxSelections: number) => {
    setSlotSelections((prev) => {
      const next = [...prev];
      const sel = next[slotStep];
      const current = new Map(sel.selectedByGroup.get(groupId) ?? new Map<number, number>());
      const currentQty = current.get(optionId) ?? 0;

      if (currentQty > 0) {
        current.set(optionId, 0);
      } else {
        if (maxSelections === 1) {
          for (const k of current.keys()) current.set(k, 0);
        } else {
          const selectedCount = Array.from(current.values()).filter((q) => q > 0).length;
          if (maxSelections > 0 && selectedCount >= maxSelections) return prev;
        }
        // maxSelections === 0 = sin límite, siempre permite agregar
        current.set(optionId, 1);
      }

      const newMap = new Map(sel.selectedByGroup);
      newMap.set(groupId, current);
      next[slotStep] = { ...sel, selectedByGroup: newMap };
      return next;
    });
    setSlotGroupErrors((prev) => { const n = new Set(prev); n.delete(groupId); return n; });
  };

  // Ajusta la cantidad de una opción con stepper dentro de un slot del combo
  // (grupo con allowsQuantity, ej. "2x Queso Cheddar" en un slot del stepper multi-producto).
  const setSlotOptionQty = (
    group: ComboSlotExpanded["product"]["modifierGroups"][number],
    optionId: number,
    newQty: number
  ) => {
    setSlotSelections((prev) => {
      const next = [...prev];
      const sel = next[slotStep];
      const current = new Map(sel.selectedByGroup.get(group.id) ?? new Map<number, number>());

      const opt = group.options.find((o) => o.id === optionId);
      const maxOptQty = opt?.maxQuantity ?? null;
      const clampedQty = maxOptQty !== null ? Math.min(newQty, maxOptQty) : newQty;
      const finalQty = Math.max(0, clampedQty);

      if (finalQty > 0 && (current.get(optionId) ?? 0) === 0) {
        const activeCount = Array.from(current.values()).filter((q) => q > 0).length;
        if (group.maxSelections !== 0 && activeCount >= group.maxSelections) return prev;
      }

      current.set(optionId, finalQty);
      const newMap = new Map(sel.selectedByGroup);
      newMap.set(group.id, current);
      next[slotStep] = { ...sel, selectedByGroup: newMap };
      return next;
    });
    setSlotGroupErrors((prev) => { const n = new Set(prev); n.delete(group.id); return n; });
  };

  const updateSlotComment = (val: string) => {
    setSlotSelections((prev) => {
      const next = [...prev];
      next[slotStep] = { ...next[slotStep], comment: val };
      return next;
    });
  };

  const scrollSlotToTop = () => {
    slotScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goSlotNext = () => {
    if (isSlotStepActive && currentSlot && currentSlotSel) {
      const errors = validateSlotSelection(currentSlot, currentSlotSel);
      if (errors.length > 0) { setSlotGroupErrors(new Set(errors)); return; }
      setSlotGroupErrors(new Set());
    }
    if (isInclusionStep) {
      const errs: Record<string, string | null> = {};
      let ok = true;
      for (const inc of combo?.categoryInclusions ?? []) {
        const key = String(inc.id);
        const min = Number(inc.minChoices ?? 0);
        const selCount = (inclusionSelections[key] ?? []).length;
        if (selCount < min) {
          ok = false;
          errs[key] = min === 1 ? "Debés seleccionar una opción" : `Debés seleccionar al menos ${min} opciones`;
        } else {
          errs[key] = null;
        }
      }
      setInclusionErrors(errs);
      if (!ok) return;
    }
    if (slotStep < totalSlotSteps - 1) {
      setSlotStep((s) => s + 1);
      scrollSlotToTop();
    } else {
      handleSlotConfirm();
    }
  };

  const goSlotBack = () => {
    if (slotStep > 0) {
      setSlotGroupErrors(new Set());
      setSlotStep((s) => s - 1);
      scrollSlotToTop();
    } else {
      router.back();
    }
  };

  const handleSlotConfirm = async () => {
    if (submitting) return;
    // Validar último slot si corresponde
    if (isSlotStepActive && currentSlot && currentSlotSel) {
      const errors = validateSlotSelection(currentSlot, currentSlotSel);
      if (errors.length > 0) { setSlotGroupErrors(new Set(errors)); return; }
    }

    const slotInputs: QuoteComboSlotInput[] = slotSelections.map((sel) => {
      const options = slotSelectedByGroupToOptions(sel.selectedByGroup);
      return {
        combo_item_id: sel.comboItemId,
        slot_index: sel.slotIndex,
        option_ids: options.map((o) => o.id),
        options,
        comment: sel.comment || undefined,
      };
    });

    setSubmitting(true);
    try {
      const result = await quoteComboSlots({
        comboId: Number(combo.id),
        qty: 1,
        slots: slotInputs,
        inclusionSelections: inclusionSelectionsForQuote,
      });

      const eff = result ? Number(result.breakdown.effectivePerCombo) : null;
      const unit = Number.isFinite(eff) ? eff! : (toNum(combo.effectivePrice ?? combo.basePrice));

      const img = fixImageUrl(combo.imageUrl ?? "") || "/placeholder.svg";

      const comboItems = slotSelections.map((sel, i) => {
        const slot = slots[i];
        const options = slotSelectedByGroupToOptions(sel.selectedByGroup);
        const optNames = options.map(({ id, qty: optQty }) => {
          for (const g of slot.product.modifierGroups) {
            const o = g.options.find((op) => op.id === id);
            if (o) return optQty > 1 ? `${optQty}x ${o.name}` : o.name;
          }
          return "";
        }).filter(Boolean);

        return {
          productId: slot.product.id,
          name: slot.product.name,
          qty: 1,
          isMain: i === 0,
          comboItemId: sel.comboItemId,
          slotIndex: sel.slotIndex,
          optionIds: options.map((o) => o.id),
          options,
          selectedOptions: optNames.length > 0 ? optNames.map((name) => ({ optionName: name, tipo: "", priceExtra: 0, qty: 1 })) : undefined,
          comment: sel.comment || undefined,
        };
      });

      const inclusionAsItems = selectedInclusionItems.map((s) => ({
        productId: s.productId,
        name: s.name,
        qty: 1,
        isInclusion: true as any,
        inclusionId: s.inclusionId,
        inclusionTitle: s.inclusionTitle,
        unitPrice: s.unitPrice,
        basePrice: s.basePrice,
      }));

      addToCart({
        uniqueId: `${combo.id}-slots-${Date.now()}`,
        id: Number(combo.id),
        name: combo.name ?? "Combo",
        description: combo.description ?? "",
        price: unit,
        finalPrice: unit,
        image: img !== "/placeholder.svg" ? img : "",
        category: "combo",
        quantity: 1,
        observations: "",
        kind: "combo" as const,
        comboName: combo.name,
        comboItems: [...comboItems, ...inclusionAsItems],
        isDefaultCategory: false,
      });

      setJustAdded(true);
      setTimeout(() => { setJustAdded(false); setSubmitting(false); router.back(); }, 600);
    } catch {
      setSubmitting(false);
    }
  };

  // Preseleccionar isDefault cuando cambian los grupos disponibles (carga inicial / cambio de combo)
  useEffect(() => {
    setSelectedByGroup(buildDefaultSelection(groups));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainProduct?.id, combo?.id]);

  useEffect(() => {
    const map: Record<string, string[]> = {};
    for (const inc of combo?.categoryInclusions ?? []) {
      map[String(inc.id)] = [];
    }
    setInclusionSelections(map);
    setInclusionErrors({});
    setFormError(null);
  }, [combo, inclusionsProducts]);

  useEffect(() => {
    if (combo && !isAllowedForDelivery((combo as any).channel)) {
      router.replace("/");
    }
  }, [combo, router]);

  // cerrar dropdowns de inclusiones
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest(".inc-dropdown")) setOpenIncId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIncId(null);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Opciones seleccionadas con cantidad (todos los grupos)
  const allSelectedWithQty = useMemo(() => {
    const result: { id: number; qty: number }[] = [];
    for (const qtyMap of selectedByGroup.values()) {
      for (const [optId, q] of qtyMap) {
        if (q > 0) result.push({ id: optId, qty: q });
      }
    }
    return result;
  }, [selectedByGroup]);

  const selectedKey = useMemo(
    () => allSelectedWithQty.map(o => `${o.id}x${o.qty}`).join(","),
    [allSelectedWithQty]
  );

  // Pares {group, option, qty} de todo lo seleccionado, en el orden de los grupos/opciones
  const selectedEntries = useMemo(() => {
    const result: { group: ModifierGroup; option: ModifierGroupOption; qty: number }[] = [];
    for (const group of groups) {
      const qtyMap = selectedByGroup.get(group.id);
      if (!qtyMap) continue;
      for (const opt of group.options) {
        const q = qtyMap.get(opt.id) ?? 0;
        if (q > 0) result.push({ group, option: opt, qty: q });
      }
    }
    return result;
  }, [groups, selectedByGroup]);

  // Toggle de una opción (para opciones con maxQuantity === 1 o grupos radio)
  const toggleOption = (group: ModifierGroup, optionId: number) => {
    if (missingModifierGroupId === group.id) setMissingModifierGroupId(null);
    setSelectedByGroup((prev) => {
      const next = new Map(prev);
      const currentMap = new Map(next.get(group.id) ?? new Map<number, number>());

      const currentQty = currentMap.get(optionId) ?? 0;
      if (currentQty > 0) {
        const selectedCount = Array.from(currentMap.values()).filter(q => q > 0).length;
        if (group.isRequired && selectedCount <= group.minSelections) return prev;
        currentMap.set(optionId, 0);
      } else {
        if (group.maxSelections === 1) {
          for (const k of currentMap.keys()) currentMap.set(k, 0);
        }
        const selectedCount = Array.from(currentMap.values()).filter(q => q > 0).length;
        if (group.maxSelections === 0 || selectedCount < group.maxSelections) currentMap.set(optionId, 1);
      }

      next.set(group.id, currentMap);
      return next;
    });
  };

  // Ajusta la cantidad de una opción con stepper (maxQuantity > 1 o null = ilimitada)
  const setOptionQty = (group: ModifierGroup, optionId: number, newQty: number) => {
    if (missingModifierGroupId === group.id) setMissingModifierGroupId(null);
    setSelectedByGroup((prev) => {
      const next = new Map(prev);
      const currentMap = new Map(next.get(group.id) ?? new Map<number, number>());

      const opt = group.options.find(o => o.id === optionId);
      const maxOptQty = opt?.maxQuantity ?? null;
      const clampedQty = maxOptQty !== null ? Math.min(newQty, maxOptQty) : newQty;
      const finalQty = Math.max(0, clampedQty);

      // Si estamos activando una opción nueva (0→qty>0), verificar maxSelections del grupo
      if (finalQty > 0 && (currentMap.get(optionId) ?? 0) === 0) {
        const activeCount = Array.from(currentMap.values()).filter(q => q > 0).length;
        if (group.maxSelections !== 0 && activeCount >= group.maxSelections) return prev;
      }

      if (finalQty === 0) {
        const selectedCount = Array.from(currentMap.values()).filter(q => q > 0).length;
        const curOptQty = currentMap.get(optionId) ?? 0;
        if (group.isRequired && curOptQty > 0 && selectedCount <= group.minSelections) return prev;
      }

      currentMap.set(optionId, finalQty);
      next.set(group.id, currentMap);
      return next;
    });
  };

  // Labels de promo a mostrar en banner — siempre desde el catálogo (combo.activePromoLabels
  // para promos sin restricción de modificador + activatesPromo por opción para las
  // restringidas a un modificador puntual). Nunca desde el endpoint genérico de
  // /price-lists/active-promos: ese es exclusivo de home/categorías (PromoBanner).
  const promoBannerLabels = useMemo(() => {
    const labels: string[] = [];
    const seen = new Set<string>();

    for (const label of combo?.activePromoLabels ?? []) {
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
  }, [combo?.activePromoLabels, groups]);

  // helpers inclusiones
  const toggleSelectInclusion = (inc: CategoryInclusion, prodId: string) => {
    const key = String(inc.id);
    const max = Number(inc.maxChoices ?? 1);

    setInclusionSelections((prev) => {
      const current = prev[key] ?? [];
      if (current.includes(prodId)) {
        return { ...prev, [key]: current.filter((x) => x !== prodId) };
      }
      if (max === 1) {
        return { ...prev, [key]: [prodId] };
      }
      const next = [...current, prodId];
      return { ...prev, [key]: next.length > max ? next.slice(0, max) : next };
    });

    setInclusionErrors((e) => ({ ...e, [key]: null }));
    setFormError(null);
  };

  // precios
  const baseList = toNum(combo?.basePrice);
  const baseEff = toNum(combo?.effectivePrice ?? combo?.basePrice);
  // Descuenta includedFreeCount por grupo (mismas reglas que el Backend) antes de sumar
  // el extra de cada opción — si no, el subtotal en vivo cobraría opciones que son gratis.
  const optionExtra = useMemo(() => {
    let sum = 0;
    for (const group of groups) {
      const qtyMap = selectedByGroup.get(group.id) ?? new Map<number, number>();
      const rule = mainItemModifierGroupRules.find((r) => r.modifierGroupId === group.id);
      const freeUnitsByOptionId = computeFreeUnitsByOption(group, qtyMap, rule?.includedFreeCount ?? 0);
      for (const opt of group.options) {
        const optQty = qtyMap.get(opt.id) ?? 0;
        if (optQty <= 0) continue;
        const paidUnits = optQty - (freeUnitsByOptionId.get(opt.id) ?? 0);
        sum += toNum(opt.precio_extra) * paidUnits;
      }
    }
    return sum;
  }, [groups, selectedByGroup, mainItemModifierGroupRules]);
  const hasPromo = Number.isFinite(baseList) && Number.isFinite(baseEff) && baseEff < baseList;
  const promoFactor = hasPromo && baseList > 0 ? Math.max(0, Math.min(1, baseEff / baseList)) : 1;

  const selectedInclusionsTotal = useMemo(() => {
    if (!combo) return 0;
    let total = 0;
    for (const inc of combo.categoryInclusions ?? []) {
      const key = String(inc.id);
      const prods = inclusionsProducts[key] ?? [];
      const sel = inclusionSelections[key] ?? [];
      for (const pid of sel) {
        const p = prods.find((x) => String(x.id) === pid);
        const raw = toNumber(p?.price);
        const final = priceWithInclusionRuleAndPromo(raw, inc, promoFactor);
        if (final) total += final;
      }
    }
    return total;
  }, [combo, inclusionsProducts, inclusionSelections, promoFactor]);

  const unitNoPromo = (baseList + optionExtra + selectedInclusionsTotal);
  const unitPromo = (baseEff + optionExtra + selectedInclusionsTotal);

  const totalNoPromo = unitNoPromo * qty;
  const totalPromo = unitPromo * qty;

  const selectedInclusionItems = useMemo(() => {
    if (!combo) return [];
    const out: Array<{
      inclusionId: string;
      inclusionTitle: string;
      productId: number;
      name: string;
      unitPrice: number;
      basePrice: number;
    }> = [];

    for (const inc of combo.categoryInclusions ?? []) {
      const key = String(inc.id);
      const prods = inclusionsProducts[key] ?? [];
      const sel = inclusionSelections[key] ?? [];
      for (const pid of sel) {
        const p = prods.find((x) => String(x.id) === pid);
        const raw = toNumber(p?.price) ?? 0;
        const fin = priceWithInclusionRuleAndPromo(raw, inc, promoFactor) ?? raw;
        out.push({
          inclusionId: key,
          inclusionTitle: inc.name || inc.category?.name || "Opción",
          productId: Number(p?.id ?? 0),
          name: String(p?.name ?? "Ítem"),
          unitPrice: fin,
          basePrice: raw,
        });
      }
    }
    return out;
  }, [combo, inclusionsProducts, inclusionSelections, promoFactor]);

  // items
  const mainItem = useMemo(() => combo?.items?.find((i) => i.isMain), [combo]);
  const extras = useMemo(() => (combo?.items ?? []).filter((i) => !i.isMain), [combo]);

  // Arma el array de items para /pricing/quote COMBO
  const quoteItems = useMemo((): QuoteComboItem[] => {
    const out: QuoteComboItem[] = [];

    if (mainItem?.productId) {
      out.push({
        productId: Number(mainItem.productId),
        quantity: Number(mainItem.quantity ?? 1),
        options: allSelectedWithQty.filter((o) => Number.isFinite(o.id) && o.id > 0),
      });
    }

    for (const ci of combo?.items ?? []) {
      if (!ci.isMain && ci.productId) {
        out.push({ productId: Number(ci.productId), quantity: Number(ci.quantity ?? 1), optionIds: [] });
      }
    }

    for (const inc of combo?.categoryInclusions ?? []) {
      const key = String(inc.id);
      for (const pid of inclusionSelections[key] ?? []) {
        out.push({ productId: Number(pid), quantity: 1, optionIds: [] });
      }
    }

    return out;
  }, [mainItem, allSelectedWithQty, combo, inclusionSelections]);

  // Cotizar en el back cada vez que cambian qty / opciones / inclusiones
  useEffect(() => {
    if (!combo?.id) return;

    const ctrl = new AbortController();

    (async () => {
      const result = await quoteCombo({
        comboId: Number(combo.id),
        qty: Math.max(1, qty),
        items: quoteItems,
        signal: ctrl.signal,
      });

      if (!result) return;

      const eff = Number(result.breakdown.effectivePerCombo);
      if (!Number.isFinite(eff)) return;

      const orig = Number(result.breakdown.originalPerCombo);

      setQuotedEffective(eff);
      setQuotedList(Number.isFinite(orig) && orig > eff ? orig : null);
      const hasDiscount = !!(result.appliedPriceList || result.appliedPromotion);
      setQuoteHasPromo(hasDiscount);
      setQuoteIsFromPriceList(!!result.appliedPriceList);
      if (result.appliedPriceList) {
        setPromoLabel(result.appliedPriceList.listName);
      } else if (result.appliedPromotion) {
        setPromoLabel(result.appliedPromotion.name);
      } else {
        setPromoLabel(null);
      }
    })().catch(() => { });

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combo?.id, qty, quoteItems]);

  // Imagen principal
  const heroImg =
    fixImageUrl(
      (combo?.imageUrl && combo.imageUrl.trim() ? combo.imageUrl : "") ||
      (mainProduct?.imageUrl && mainProduct.imageUrl.trim() ? mainProduct.imageUrl : "") ||
      (mainItem?.product?.imageUrl && mainItem.product.imageUrl.trim() ? mainItem.product.imageUrl : "") ||
      ""
    ) || "/placeholder.svg";

  const handleAdd = () => {
    if (!combo) return;
    if (submitting) return; // 🔒 Prevenir doble click

    // Validar que todos los grupos obligatorios del producto principal cumplan su mínimo
    const missingGroup = groups.find((g) => {
      if (!g.isRequired) return false;
      const qtyMap = selectedByGroup.get(g.id);
      const selectedCount = qtyMap ? Array.from(qtyMap.values()).filter(q => q > 0).length : 0;
      return selectedCount < g.minSelections;
    });
    if (missingGroup) {
      setMissingModifierGroupId(missingGroup.id);
      setFormError(null);
      return;
    }

    const currentSelectedEntries = [...selectedEntries];

    // precios para el carrito — servidor tiene prioridad sobre math local
    const unit = quotedEffective ?? unitPromo;
    const final = quotedEffective !== null ? Math.round(quotedEffective * qty) : Math.round(totalPromo);

    const img = heroImg !== "/placeholder.svg" ? heroImg : "";

    const validateInclusions = (): boolean => {
      const errs: Record<string, string | null> = {};
      let ok = true;

      for (const inc of combo?.categoryInclusions ?? []) {
        const key = String(inc.id);
        const min = Number(inc.minChoices ?? 0);
        const max = Number(inc.maxChoices ?? 1);
        const selCount = (inclusionSelections[key] ?? []).length;

        if (selCount < min) {
          ok = false;
          errs[key] = min === 1
            ? `Debés seleccionar ${min} opción`
            : `Debés seleccionar al menos ${min} opciones`;
        } else if (selCount > max) {
          ok = false;
          errs[key] = `Seleccionaste más de ${max} opciones`;
        } else {
          errs[key] = null;
        }
      }

      setInclusionErrors(errs);
      return ok;
    };

    if (!validateInclusions()) {
      setFormError("Completá las opciones requeridas del combo.");
      const firstKey = Object.keys(inclusionErrors).find((k) => inclusionErrors[k]);
      const el = firstKey ? document.querySelector(`[data-inc="${firstKey}"]`) : null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const legacyItems = combo.items ?? [];
    const comboItems = legacyItems.length > 0
      ? legacyItems
          .slice()
          .sort((a, b) => (a.isMain === b.isMain ? 0 : a.isMain ? -1 : 1))
          .map((i) => ({
            productId: Number(i.productId),
            name: i.product?.name ?? "Ítem",
            qty: Number(i.quantity ?? 1),
            isMain: !!i.isMain,
          }))
      : slots.map((slot, i) => ({
          productId: slot.product.id,
          name: slot.product.name,
          qty: 1,
          isMain: i === 0,
        }));

    const inclusionAsItems = selectedInclusionItems.map((s) => ({
      productId: s.productId,
      name: s.name,
      qty: 1,
      isInclusion: true as any,
      inclusionTitle: s.inclusionTitle,
      unitPrice: s.unitPrice,
      basePrice: s.basePrice,
    }));

    // Construir array de opciones seleccionadas (todos los grupos del producto principal)
    const selectedOptionsArr = currentSelectedEntries.map(({ group, option, qty: optQty }) => ({
      productOptionId: Number(option.id),
      optionId: Number(option.id),
      optionName: optQty > 1 ? `${optQty}x ${option.name || ""}` : (option.name || ""),
      tipo: group.name || "Modificador",
      priceExtra: toNum(option.precio_extra) * optQty,
      qty: optQty,
    }));

    const cartItem = {
      uniqueId: `${combo.id}-${currentSelectedEntries.map(e => `${e.option.id}x${e.qty}`).join("-") || "noopt"}-${Date.now()}`,
      id: Number(combo.id) || 0,
      name: combo.name || "Combo",
      description: mainProduct?.description || combo.description || "",
      price: unit,
      finalPrice: final,
      image: img,
      category: "combo",
      quantity: qty,
      observations: notes,
      kind: "combo" as const,
      comboName: combo.name,
      comboItems: [...comboItems, ...inclusionAsItems],
      selectedOptions: selectedOptionsArr.length > 0 ? selectedOptionsArr : undefined,
      isDefaultCategory: false,
    };

    setSubmitting(true); // 🔒 Bloquear mientras se procesa
    addToCart(cartItem);

    setFormError(null);
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

  if (!combo && !loading) {
    return (
      <div className="bg-background">
        <SiteHeader showBack onBack={() => router.back()} onCartClick={() => router.push("/carrito")} />
        <div className="mx-auto w-full max-w-6xl p-4">No se encontró  el combo.</div>
      </div>
    );
  }

  // ===== STEPPER DE SLOTS (mobile-first) =====
  if (hasSlotModifiers) {
    const isLastStep = slotStep === totalSlotSteps - 1;

    return (
      <div className="bg-background flex-1 flex flex-col overflow-hidden">
        <SiteHeader showBack onBack={goSlotBack} onCartClick={() => router.push("/carrito")} />
        <ClosedBanner />
        <InfoBanner />

        {/* Contenido scrolleable */}
        <div ref={slotScrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto w-full px-4 pt-4 pb-6 grid grid-cols-1 md:grid-cols-2 gap-5 md:items-start">
            {/* Imagen del combo — arriba en mobile (en el flujo, no fija), a la izquierda y sticky en desktop */}
            {heroImg && heroImg !== "/placeholder.svg" && (
              <div className="md:sticky md:top-4">
                <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 bg-white/60">
                  <div className="relative w-full aspect-[3/2] md:aspect-[4/3]">
                    <Image
                      src={heroImg}
                      alt={combo?.name ?? "Combo"}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Nombre + dots + paso actual — a la derecha en desktop, debajo de la imagen en mobile */}
            <div className={heroImg && heroImg !== "/placeholder.svg" ? "" : "md:col-span-2"}>
            <h2 className="text-base font-extrabold uppercase text-foreground mb-3">
              {combo?.name ?? "Combo"}
            </h2>

            <div className="flex items-center gap-1.5 mb-5">
              {Array.from({ length: totalSlotSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all duration-200 ${
                    i < slotStep
                      ? "w-2 bg-[var(--brand-color)]"
                      : i === slotStep
                      ? "w-5 bg-[var(--brand-color)]"
                      : "w-2 bg-black/10"
                  }`}
                />
              ))}
            </div>

            {/* PASO: slot */}
            {isSlotStepActive && currentSlot && currentSlotSel && (
              <div className="space-y-4">

                {/* Mini-resumen de slots ya configurados */}
                {slotStep > 0 && (
                  <div className="space-y-1.5">
                    {slotSelections.slice(0, slotStep).map((prevSel, i) => {
                      const prevSlot = slots[i];
                      const prevOptNames = slotSelectedByGroupToOptions(prevSel.selectedByGroup)
                        .map(({ id: oid, qty: oQty }) => {
                          for (const g of prevSlot.product.modifierGroups) {
                            const o = g.options.find((op) => op.id === oid);
                            if (o) return oQty > 1 ? `${oQty}x ${o.name}` : o.name;
                          }
                          return null;
                        })
                        .filter(Boolean) as string[];
                      return (
                        <div key={i} className="rounded-xl bg-black/[0.04] px-3 py-2 flex items-start gap-2">
                          <span className="text-[10px] font-black uppercase text-muted-foreground/60 mt-0.5 shrink-0 w-3 text-center">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-semibold text-muted-foreground">{prevSlot.product.name}</span>
                            {prevOptNames.length > 0 && (
                              <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{prevOptNames.join(" · ")}</p>
                            )}
                          </div>
                          <span className="text-xs text-emerald-600 font-bold shrink-0">✓</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Encabezado del slot actual — prominente */}
                <div className="rounded-2xl bg-[color-mix(in_srgb,var(--brand-color),transparent_91%)] border border-[color-mix(in_srgb,var(--brand-color),transparent_65%)] px-4 py-3">
                  {slots.length > 1 && (
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--brand-color)] mb-1.5">
                      {slotStep + 1} de {slots.length}
                    </p>
                  )}
                  <p className="text-xl font-extrabold leading-tight text-foreground">{currentSlot.product.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {slots.length > 1
                      ? `¿Cómo querés esta ${currentSlot.product.name.toLowerCase()}?`
                      : "Elegí tus opciones"}
                  </p>
                </div>

                {currentSlot.product.modifierGroups.map((group) => {
                  const rule = currentSlot.modifierGroupRules.find((r) => r.modifierGroupId === group.id);
                  const freeCount = rule?.includedFreeCount ?? 0;
                  const qtyMap = currentSlotSel.selectedByGroup.get(group.id) ?? new Map<number, number>();
                  const hasError = slotGroupErrors.has(group.id);
                  const isRadio = group.maxSelections === 1;
                  const usesStepper = group.allowsQuantity ?? false;
                  const maxSel = group.maxSelections ?? 1;
                  // Aplicar overrides del combo: filtrar opciones deshabilitadas
                  const visibleOptions = group.options.filter(
                    (o) => modifierOverrideByOptionId.get(o.id)?.isEnabled !== false
                  );
                  if (visibleOptions.length === 0) return null;

                  const selectedCount = Array.from(qtyMap.values()).filter((q) => q > 0).length;
                  const freeUnitsByOptionId = computeFreeUnitsByOption(
                    {
                      ...group,
                      options: visibleOptions.map((o) => ({
                        id: o.id,
                        name: o.name,
                        precio_extra: modifierOverrideByOptionId.get(o.id)?.extraOverride ?? (o.priceExtra ?? 0),
                        isDefault: !!o.isDefault,
                        isActive: true,
                        sortOrder: o.sortOrder ?? 0,
                        maxQuantity: o.maxQuantity ?? null,
                      })),
                    } as unknown as ModifierGroup,
                    qtyMap,
                    freeCount
                  );

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
                            ? isRadio ? "(obligatorio - elige una)" : `(obligatorio - mín ${group.minSelections})`
                            : isRadio ? "(opcional - elige una)"
                            : group.maxSelections === 0 ? "(opcional - sin límite)"
                            : `(opcional - hasta ${group.maxSelections})`}
                        </span>
                        {freeCount > 0 && (
                          <span className="ml-auto text-[10.5px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-1.5 py-0.5 leading-none">
                            {selectedCount}/{freeCount} gratis
                          </span>
                        )}
                      </div>
                      {hasError && (
                        <p className="text-xs font-medium text-red-600">
                          {group.minSelections > 1 ? `Debés seleccionar al menos ${group.minSelections} opciones.` : "Debés seleccionar una opción."}
                        </p>
                      )}
                      {visibleOptions.map((opt) => {
                        const optQty = qtyMap.get(opt.id) ?? 0;
                        const isSelected = optQty > 0;
                        const ov = modifierOverrideByOptionId.get(opt.id);
                        const extra = ov?.extraOverride != null ? Number(ov.extraOverride) : (opt.priceExtra ?? 0);
                        const freeUnits = freeUnitsByOptionId.get(opt.id) ?? 0;
                        const paidUnits = optQty - freeUnits;
                        const isFullyFree = isSelected && freeUnits >= optQty;

                        return (
                          <div
                            key={opt.id}
                            onClick={() => {
                              if (!usesStepper) { toggleSlotOption(group.id, opt.id, maxSel); return; }
                              // Tap en la fila: 0→1, 1→0. Con 2+ solo +/- lo modifican.
                              if (optQty === 0) setSlotOptionQty(group, opt.id, 1);
                              else if (optQty === 1) setSlotOptionQty(group, opt.id, 0);
                            }}
                            role={isRadio ? "radio" : "checkbox"}
                            aria-checked={isSelected}
                            className={[
                              "w-full rounded-lg border px-3 py-2 flex items-center justify-between transition-colors cursor-pointer",
                              isSelected
                                ? "border-[var(--brand-color)] bg-[#fff5f2]"
                                : "border-transparent hover:bg-black/5",
                            ].join(" ")}
                          >
                            <div className="flex items-center gap-3">
                              {!isRadio && !usesStepper && (
                                <Checkbox checked={isSelected} onCheckedChange={() => {}} className="pointer-events-none" />
                              )}
                              <span className="text-sm">{opt.name}</span>
                            </div>
                            {usesStepper ? (
                              <div className="flex items-center gap-2">
                                {extra > 0 && (
                                  <span className="text-sm font-semibold text-slate-500">
                                    {freeUnits > 0 && (
                                      <span className="text-emerald-600 mr-1">{freeUnits} gratis</span>
                                    )}
                                    {paidUnits > 0 && `+${fmt(extra)}/u`}
                                  </span>
                                )}
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setSlotOptionQty(group, opt.id, optQty - 1); }}
                                    disabled={optQty === 0}
                                    className="h-7 w-7 flex items-center justify-center rounded-full border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50 active:bg-slate-100 text-base leading-none"
                                  >
                                    −
                                  </button>
                                  <span className="w-7 text-center text-sm font-semibold">{optQty}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setSlotOptionQty(group, opt.id, optQty + 1); }}
                                    disabled={
                                      (typeof opt.maxQuantity === "number" && opt.maxQuantity !== null && optQty >= opt.maxQuantity) ||
                                      (optQty === 0 && maxSel !== 0 && selectedCount >= maxSel)
                                    }
                                    className="h-7 w-7 flex items-center justify-center rounded-full border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50 active:bg-slate-100 text-base leading-none"
                                  >
                                    ＋
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span className={`text-sm font-semibold ${isFullyFree ? "line-through text-muted-foreground" : ""}`}>
                                {extra > 0 ? `+${fmt(extra)}` : isRadio ? "" : "Gratis"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Comentario por slot */}
                <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
                  <p className="text-sm font-semibold mb-2">Comentario (opcional)</p>
                  <textarea
                    value={currentSlotSel.comment}
                    onChange={(e) => e.target.value.length <= MAX_NOTES && updateSlotComment(e.target.value)}
                    maxLength={MAX_NOTES}
                    rows={2}
                    placeholder="Ej: sin cebolla"
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-color)] resize-none min-h-[40px]"
                  />
                  <p className="mt-1 text-xs text-muted-foreground text-right">
                    {currentSlotSel.comment.length}/{MAX_NOTES}
                  </p>
                </div>
              </div>
            )}

            {/* PASO: todas las inclusiones en un solo paso final */}
            {isInclusionStep && (
              <div className="space-y-4">
                {(combo?.categoryInclusions ?? []).map((inc) => {
                  const key = String(inc.id);
                  const prods = inclusionsProducts[key] ?? [];
                  const sel = inclusionSelections[key] ?? [];
                  const max = Number(inc.maxChoices ?? 1);
                  const isSingle = max <= 1;
                  const min = Number(inc.minChoices ?? 0);
                  const title = capitalizeFirst(inc.name || inc.subcategory?.name || inc.category?.name || "Elegí tu opción");

                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="text-sm font-semibold flex items-center gap-1">
                        {title}
                        {min > 0 && <span className="text-red-500">*</span>}
                        {!isSingle && (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            (elegí {min === max ? min : `${min}–${max}`})
                          </span>
                        )}
                      </div>

                      {isSingle ? (
                        <div className="relative inc-dropdown">
                          <button
                            type="button"
                            onClick={() => setOpenIncId((s) => (s === key ? null : key))}
                            className={[
                              "w-full rounded-xl border px-3 py-2.5 text-sm bg-white",
                              "ring-1 focus:outline-none focus:ring-2 flex items-center justify-between",
                              inclusionErrors[key]
                                ? "ring-red-400 focus:ring-red-500"
                                : "ring-black/5 focus:ring-[var(--brand-color)]",
                            ].join(" ")}
                          >
                            <span className="truncate text-left">
                              {(() => {
                                const p = prods.find((x) => String(x.id) === sel[0]);
                                if (!p) return <span className="text-muted-foreground">Elegir...</span>;
                                const raw = toNumber(p.price);
                                const fin = priceWithInclusionRuleAndPromo(raw, inc, promoFactor);
                                return `${p.name}${fin != null ? ` — ${fmt(fin)}` : ""}`;
                              })()}
                            </span>
                            <span className="ml-3 text-xs opacity-50 shrink-0">▼</span>
                          </button>

                          {openIncId === key && (
                            <div
                              className="absolute z-50 mt-1.5 w-full rounded-2xl bg-white shadow-lg ring-1 ring-black/8 p-2 max-h-64 overflow-y-auto"
                              role="listbox"
                              aria-label={title}
                            >
                              {min === 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInclusionSelections((prev) => ({ ...prev, [key]: [] }));
                                    setInclusionErrors((e) => ({ ...e, [key]: null }));
                                    setFormError(null);
                                    setOpenIncId(null);
                                  }}
                                  className="w-full text-left rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-black/5 mb-1"
                                >
                                  — No seleccionar —
                                </button>
                              )}
                              {prods.length === 0 ? (
                                <p className="p-2 text-sm text-muted-foreground">No hay opciones disponibles.</p>
                              ) : (
                                prods.map((p) => {
                                  const raw = toNumber(p.price);
                                  const fin = priceWithInclusionRuleAndPromo(raw, inc, promoFactor);
                                  const checked = sel.includes(String(p.id));
                                  return (
                                    <button
                                      key={String(p.id)}
                                      type="button"
                                      onClick={() => {
                                        setInclusionSelections((prev) => ({ ...prev, [key]: [String(p.id)] }));
                                        setInclusionErrors((e) => ({ ...e, [key]: null }));
                                        setFormError(null);
                                        setOpenIncId(null);
                                      }}
                                      className={[
                                        "w-full rounded-lg border p-2.5 mb-1.5 last:mb-0",
                                        "flex items-center justify-between gap-3 text-left",
                                        checked ? "ring-2 ring-[var(--brand-color)] border-transparent" : "ring-1 ring-black/5",
                                        "hover:bg-black/5",
                                      ].join(" ")}
                                      role="option"
                                      aria-selected={checked}
                                    >
                                      <div className="flex items-center gap-2.5">
                                        <span
                                          className={[
                                            "inline-block h-4 w-4 rounded-full border shrink-0",
                                            checked
                                              ? "border-[var(--brand-color)] bg-[var(--brand-color)]"
                                              : "border-gray-300",
                                          ].join(" ")}
                                          aria-hidden
                                        />
                                        <span className="text-sm font-medium">{p.name}</span>
                                      </div>
                                      <div className="text-sm text-right shrink-0">
                                        {raw !== null && fin !== null ? (
                                          raw === fin ? (
                                            <span className="text-muted-foreground">{fmt(fin)}</span>
                                          ) : (
                                            <>
                                              <span className="line-through opacity-40 mr-1.5 text-xs">{fmt(raw)}</span>
                                              <span className="font-semibold text-[var(--brand-color)]">{fmt(fin)}</span>
                                            </>
                                          )
                                        ) : null}
                                      </div>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          )}

                          {inclusionErrors[key] && (
                            <p className="mt-1 text-xs text-red-600">{inclusionErrors[key]}</p>
                          )}
                        </div>
                      ) : (
                        /* Multi-choice: lista directa con checkboxes */
                        <div className={[
                          "rounded-2xl ring-1 bg-white/60 p-3 space-y-2",
                          inclusionErrors[key] ? "ring-red-400 bg-red-50/70" : "ring-black/5",
                        ].join(" ")}>
                          <p className="text-xs font-medium text-muted-foreground">
                            {sel.length}/{max} seleccionadas
                          </p>
                          {inclusionErrors[key] && (
                            <p className="text-xs font-medium text-red-600">{inclusionErrors[key]}</p>
                          )}
                          {prods.map((p) => {
                            const isSelected = sel.includes(String(p.id));
                            const raw = toNumber(p.price);
                            const fin = priceWithInclusionRuleAndPromo(raw, inc, promoFactor);
                            return (
                              <div
                                key={p.id}
                                onClick={() => toggleSelectInclusion(inc, String(p.id))}
                                role="checkbox"
                                aria-checked={isSelected}
                                className={[
                                  "w-full rounded-lg border px-3 py-2 flex items-center justify-between transition-colors cursor-pointer",
                                  isSelected ? "border-[var(--brand-color)] bg-[#fff5f2]" : "border-transparent hover:bg-black/5",
                                ].join(" ")}
                              >
                                <div className="flex items-center gap-3">
                                  <Checkbox checked={isSelected} onCheckedChange={() => {}} className="pointer-events-none" />
                                  <span className="text-sm">{p.name}</span>
                                </div>
                                <span className="text-sm font-semibold text-muted-foreground">
                                  {fin != null && fin > 0 ? `+${fmt(fin)}` : fin === 0 ? "Gratis" : ""}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </div>
        </div>

        {/* Footer de navegación — en flujo normal, sticky al fondo */}
        <div className="shrink-0 border-t border-black/5 bg-background px-4 pt-2 pb-3">
          <div className="max-w-lg mx-auto">
            {/* Subtotal cotizado en tiempo real */}
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs text-muted-foreground">Subtotal</span>
              <span className="text-sm font-bold text-[var(--brand-color)]">
                {slotSubtotal != null ? fmt(slotSubtotal) : fmt(toNum(combo?.effectivePrice ?? combo?.basePrice))}
              </span>
            </div>
          </div>
          <div className="max-w-lg mx-auto flex gap-3">
            <Button
              variant="outline"
              onClick={goSlotBack}
              className="flex-1 h-11 text-sm rounded-xl"
            >
              {slotStep === 0 ? "Cancelar" : "← Anterior"}
            </Button>
            <Button
              onClick={orderingEnabled ? goSlotNext : undefined}
              disabled={disabledByStatus || submitting}
              className="flex-1 h-11 text-sm rounded-xl text-white bg-[var(--brand-color)] hover:brightness-95 active:brightness-90 disabled:opacity-60"
            >
              {submitting
                ? "Agregando..."
                : disabledByStatus
                ? isTableMode ? "Mesa no habilitada" : pickupOnly ? "Solo en el local" : "Local cerrado"
                : isLastStep
                ? (justAdded ? "Agregado ✔" : "Agregar al carrito")
                : "Siguiente →"}
            </Button>
          </div>
        </div>

        <BlockingLoader open={loading} message="Cargando combo..." />
      </div>
    );
  }

  return (
    <div className="bg-background">
      <SiteHeader showBack onBack={() => router.back()} onCartClick={() => router.push("/carrito")} />
      <ClosedBanner />
      <InfoBanner />

      <div className="mx-auto w-full max-w-6xl p-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Izquierda */}
        <div className="space-y-3">
          <h2 className="text-xl font-extrabold uppercase">{combo?.name ?? "Combo"}</h2>

          <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 bg-white/60">
            <div className="relative w-full aspect-[3/2] md:aspect-[16/10] max-h-[340px] mx-auto">
              <Image
                src={heroImg}
                alt={combo?.name ?? "Combo"}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          </div>

          <h3 className="text-xl font-extrabold uppercase">
            {(() => {
              const name = mainProduct?.name ?? combo?.name ?? "Combo";
              const qty = Number(mainItem?.quantity ?? 1);
              return qty > 1 ? `${qty}x ${name}` : name;
            })()}
          </h3>

          {(mainProduct?.description || combo?.description) && (
            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3 text-sm text-muted-foreground">
              {mainProduct?.description ?? combo?.description}
            </div>
          )}

          {/* Observaciones */}
          <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
            <div className="text-sm font-semibold mb-2">Observaciones:</div>
            <textarea
              value={notes}
              onChange={(e) => e.target.value.length <= MAX_NOTES && setNotes(e.target.value)}
              maxLength={MAX_NOTES}
              rows={2}
              placeholder="Escribe aquí cualquier observación especial para tu pedido..."
              className="w-full rounded-md border px-3 py-2 text-sm outline-none
                        focus:ring-2 focus:ring-[var(--brand-color)]
                        resize-none min-h-[40px]"
              onInput={(e) => {
                const ta = e.currentTarget;
                ta.style.height = "auto";
                ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
              }}
            />
            <div className="mt-1 text-xs text-muted-foreground text-right">
              {notes.length}/{MAX_NOTES}
            </div>
          </div>
        </div>

        {/* Derecha */}
        <div className="space-y-4">
          {/* Banner de promos disponibles para este combo */}
          {promoBannerLabels.map((label) => (
            <div key={label} className="rounded-xl bg-green-50 ring-1 ring-green-200 px-3 py-2 flex items-center gap-2">
              <span className="text-base leading-none">🏷️</span>
              <span className="text-sm font-semibold text-green-700">{label}</span>
            </div>
          ))}

          {/* Grupos de modificadores del producto principal (N genéricos: Tamaño, Salsa, Extras, etc.) */}
          {groups.map((group) => {
            const isRadio = group.maxSelections === 1;
            const qtyMap = selectedByGroup.get(group.id) ?? new Map<number, number>();
            const hasError = missingModifierGroupId === group.id;
            const rule = mainItemModifierGroupRules.find((r) => r.modifierGroupId === group.id);
            const freeCount = rule?.includedFreeCount ?? 0;
            const freeUnitsByOptionId = computeFreeUnitsByOption(group, qtyMap, freeCount);
            const selectedCount = Array.from(qtyMap.values()).filter((q) => q > 0).length;

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
                        : group.maxSelections === 0
                        ? "(opcional - sin límite)"
                        : `(opcional - hasta ${group.maxSelections})`}
                  </span>
                  {freeCount > 0 && (
                    <span className="ml-auto text-[10.5px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-1.5 py-0.5 leading-none">
                      {selectedCount}/{freeCount} gratis
                    </span>
                  )}
                </div>
                {group.options.map((o) => {
                  const optQty = qtyMap.get(o.id) ?? 0;
                  const active = optQty > 0;
                  const plus = toNum(o.precio_extra);
                  const usesStepper = !!group.allowsQuantity;
                  const freeUnits = freeUnitsByOptionId.get(o.id) ?? 0;
                  const paidUnits = optQty - freeUnits;
                  const isFullyFree = active && freeUnits >= optQty;
                  return (
                    <div
                      key={String(o.id)}
                      onClick={() => {
                        if (!usesStepper) { toggleOption(group, o.id); return; }
                        // Tap en la fila: 0→1, 1→0. Con 2+ solo +/- lo modifican.
                        if (optQty === 0) setOptionQty(group, o.id, 1);
                        else if (optQty === 1) setOptionQty(group, o.id, 0);
                      }}
                      role={isRadio ? "radio" : "checkbox"}
                      aria-checked={active}
                      className={[
                        "w-full rounded-lg border px-3 py-2 flex items-center justify-between transition-colors cursor-pointer",
                        active
                          ? "border-[var(--brand-color)] bg-[#fff5f2]"
                          : "border-transparent hover:bg-black/5",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-3">
                        {!isRadio && !usesStepper && (
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
                      {usesStepper ? (
                        <div className="flex items-center gap-2">
                          {plus > 0 && (
                            <span className="text-sm font-semibold text-slate-500">
                              {freeUnits > 0 && (
                                <span className="text-emerald-600 mr-1">{freeUnits} gratis</span>
                              )}
                              {paidUnits > 0 && `+${fmt(plus)}/u`}
                            </span>
                          )}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setOptionQty(group, o.id, optQty - 1); }}
                              disabled={optQty === 0}
                              className="h-7 w-7 flex items-center justify-center rounded-full border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50 active:bg-slate-100 text-base leading-none"
                            >
                              −
                            </button>
                            <span className="w-7 text-center text-sm font-semibold">{optQty}</span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setOptionQty(group, o.id, optQty + 1); }}
                              disabled={
                                (typeof o.maxQuantity === 'number' && o.maxQuantity !== null && optQty >= o.maxQuantity) ||
                                (optQty === 0 && group.maxSelections !== 0 && (qtyMap ? Array.from(qtyMap.values()).filter(q => q > 0).length : 0) >= group.maxSelections)
                              }
                              className="h-7 w-7 flex items-center justify-center rounded-full border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50 active:bg-slate-100 text-base leading-none"
                            >
                              ＋
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className={`text-sm font-semibold ${isFullyFree ? "line-through text-muted-foreground" : ""}`}>
                          {plus ? `+${fmt(plus)}` : isRadio ? "" : "Gratis"}
                        </span>
                      )}
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

          {/* Inclusiones */}
          {(combo?.categoryInclusions?.length ?? 0) > 0 && (
            <div className="rounded-2xl ring-1  ring-black/5 bg-white/60 p-3 space-y-4">
              {(combo?.categoryInclusions ?? []).map((inc) => {
                const key = String(inc.id);
                const prods = inclusionsProducts[key] ?? [];
                const sel = inclusionSelections[key] ?? [];
                const max = Number(inc.maxChoices ?? 1);
                const min = Number(inc.minChoices ?? 0);
                const isSingle = max <= 1;
                const title = capitalizeFirst(inc.name || inc.subcategory?.name || inc.category?.name || "Elige una opción");

                const selectedValue = sel[0] ?? "";

                return (
                  <div key={key} data-inc={key} className="space-y-2">
                    <div className="text-sm font-semibold">
                      {title} <span className="ml-2 text-xs font-normal opacity-60">({min}/{max})</span>
                    </div>

                    {/* Single choice: select custom */}
                    {isSingle ? (
                      <div className="relative inc-dropdown">
                        <button
                          type="button"
                          onClick={() => setOpenIncId((s) => (s === key ? null : key))}
                          className={[
                            "w-full rounded-xl border px-3 py-2 text-sm bg-white",
                            "ring-1 focus:outline-none focus:ring-2",
                            inclusionErrors[key] ? "ring-red-400 focus:ring-red-500" : "ring-black/5 focus:ring-[var(--brand-color)]",
                            "flex items-center justify-between",
                          ].join(" ")}
                        >
                          <span className="truncate">
                            {(() => {
                              const selId = sel[0];
                              const p = prods.find((x) => String(x.id) === selId);
                              if (!p) return "Elegir...";
                              const raw = toNumber(p.price);
                              const fin = priceWithInclusionRuleAndPromo(raw, inc, promoFactor);
                              return p.name + (fin != null ? ` — ${fmt(fin)}` : "");
                            })()}
                          </span>
                          <span className="ml-3 text-xs opacity-60">▼</span>
                        </button>

                        {openIncId === key && (
                          <div
                            className="absolute z-50 mt-2 w-full rounded-2xl bg-white shadow-lg ring-1 ring-black/5 p-2"
                            role="listbox"
                            aria-label={title}
                          >
                            {min === 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setInclusionSelections((prev) => ({ ...prev, [key]: [] }));
                                  setInclusionErrors((e) => ({ ...e, [key]: null }));
                                  setFormError(null);
                                  setOpenIncId(null);
                                }}
                                className="w-full text-left rounded-lg border p-2 hover:bg-black/5"
                              >
                                — No seleccionar —
                              </button>
                            )}

                            {prods.length === 0 ? (
                              <div className="p-2 text-sm text-muted-foreground">No hay opciones disponibles.</div>
                            ) : (
                              prods.map((p) => {
                                const raw = toNumber(p.price);
                                const fin = priceWithInclusionRuleAndPromo(raw, inc, promoFactor);
                                const checked = sel.includes(String(p.id));
                                return (
                                  <button
                                    key={String(p.id)}
                                    type="button"
                                    onClick={() => {
                                      setInclusionSelections((prev) => ({ ...prev, [key]: [String(p.id)] }));
                                      setInclusionErrors((e) => ({ ...e, [key]: null }));
                                      setFormError(null);
                                      setOpenIncId(null);
                                    }}
                                    className={[
                                      "w-full rounded-lg border p-2 mb-2 last:mb-0",
                                      "flex items-center justify-between gap-3",
                                      checked ? "ring-2 ring-[var(--brand-color)]" : "ring-1 ring-black/5",
                                      "hover:bg-black/5",
                                    ].join(" ")}
                                    role="option"
                                    aria-selected={checked}
                                  >
                                    <div className="flex items-center gap-3">
                                      <span
                                        className={[
                                          "inline-block h-4 w-4 rounded-full border",
                                          checked ? "border-[var(--brand-color)] bg-[var(--brand-color)]" : "border-gray-400",
                                        ].join(" ")}
                                        aria-hidden
                                      />
                                      <span className="text-sm font-medium">{p.name}</span>
                                    </div>

                                    <div className="text-sm text-right">
                                      {raw !== null && fin !== null ? (
                                        raw === fin ? (
                                          <span>{fmt(fin)}</span>
                                        ) : (
                                          <>
                                            <span className="line-through opacity-50 mr-2">{fmt(raw)}</span>
                                            <span className="font-semibold text-[var(--brand-color)]">{fmt(fin)}</span>
                                          </>
                                        )
                                      ) : (
                                        "-"
                                      )}
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}

                        {inclusionErrors[key] && (
                          <div className="mt-1 text-xs text-red-600">{inclusionErrors[key]}</div>
                        )}
                      </div>
                    ) : (
                      // Multi choice
                      <details className="rounded-xl border ring-1 ring-black/5 bg-white open:ring-[var(--brand-color)]/40">
                        <summary className="cursor-pointer list-none px-3 py-2 rounded-xl flex items-center justify-between">
                          <span className="text-sm">
                            {sel.length > 0 ? `${sel.length} seleccionadas` : "Ver opciones"}
                          </span>
                          <span className="text-xs opacity-60">abrir/cerrar</span>
                        </summary>

                        <div className="p-3 pt-2 space-y-2">
                          {prods.length === 0 ? (
                            <div className="text-sm text-muted-foreground">No hay opciones disponibles.</div>
                          ) : (
                            prods.map((p) => {
                              const raw = toNumber(p.price);
                              const fin = priceWithInclusionRuleAndPromo(raw, inc, promoFactor);
                              const checked = sel.includes(String(p.id));

                              return (
                                <label
                                  key={String(p.id)}
                                  className={`flex items-center justify-between gap-3 rounded-lg border p-2 cursor-pointer ${checked ? "ring-2 ring-[var(--brand-color)]" : "ring-1 ring-black/5"
                                    }`}
                                  onClick={() => toggleSelectInclusion(inc, String(p.id))}
                                >
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      readOnly
                                      className="accent-[var(--brand-color)]"
                                    />
                                    <div className="text-sm font-medium">{p.name}</div>
                                  </div>

                                  <div className="text-sm text-right">
                                    {raw !== null && fin !== null ? (
                                      raw === fin ? (
                                        <span>{fmt(fin)}</span>
                                      ) : (
                                        <>
                                          <span className="line-through opacity-50 mr-2">{fmt(raw)}</span>
                                          <span className="font-semibold text-[var(--brand-color)]">{fmt(fin)}</span>
                                        </>
                                      )
                                    ) : (
                                      "-"
                                    )}
                                  </div>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Incluye fijo */}
          {extras.length > 0 && (
            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
              <div className="text-sm font-semibold mb-2">Incluye:</div>
              <ul className="list-disc pl-5 text-sm">
                {extras.map((it) => {
                  const quantity = Number(it.quantity ?? 0);
                  return (
                    <li key={String(it.id)}>
                      {it.product?.name ?? "Item"} {quantity > 1 ? `x${quantity}` : ""}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Cantidad */}
          <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
            <div className="text-sm font-semibold mb-2">Cantidad:</div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={loading}>
                −
              </Button>
              <div className="w-8 text-center font-semibold">{qty}</div>
              <Button variant="outline" onClick={() => setQty((q) => q + 1)} disabled={loading}>
                ＋
              </Button>
            </div>
          </div>

          {formError && (
            <div className="rounded-xl bg-red-50 text-red-700 ring-1 ring-red-200 px-3 py-2 flex items-start justify-between">
              <div className="flex items-start gap-2">
                <span aria-hidden className="mt-0.5">⚠️</span>
                <span className="text-sm">{formError}</span>
              </div>
              <button
                type="button"
                onClick={() => setFormError(null)}
                className="text-red-600/80 hover:text-red-700 text-sm"
                aria-label="Cerrar"
                title="Cerrar"
              >
                ✕
              </button>
            </div>
          )}

          {/* Total + Agregar */}
          <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">Total:</div>
              <div className="text-right">
                {(() => {
                  const effectiveTotal = quotedEffective !== null
                    ? Math.ceil(quotedEffective * qty)
                    : Math.ceil(totalPromo);
                  const listTotal = quotedEffective !== null
                    ? (quotedList !== null ? Math.ceil(quotedList * qty) : null)
                    : (hasPromo ? Math.ceil(totalNoPromo) : null);
                  const hasAnyAdjustment = quoteHasPromo || quotedList !== null || (quotedEffective === null && hasPromo);
                  const showPromo = hasAnyAdjustment && listTotal !== null && effectiveTotal < listTotal;

                  return (
                    <>
                      {showPromo && listTotal !== null && (
                        <div className="text-sm text-muted-foreground line-through">
                          {fmt(listTotal)}
                        </div>
                      )}
                      <div className="text-xl font-extrabold text-[var(--brand-color)]">
                        {fmt(effectiveTotal)}
                      </div>
                      {showPromo && (
                        <div className="text-[11px] text-green-700 font-medium">
                          {quoteIsFromPriceList ? "Precio con descuento aplicado" : "Precio promo aplicado"}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            <Button
              className={`w-full text-white transition-colors
                          bg-[var(--brand-color)]
                          hover:bg-[color-mix(in_srgb,var(--brand-color),#000_12%)]
                          active:bg-[color-mix(in_srgb,var(--brand-color),#000_18%)]
                          hover:brightness-95 active:brightness-90
                          disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none`}
              onClick={orderingEnabled ? handleAdd : undefined}
              disabled={disabledByStatus || loading || submitting}
              title={
                disabledByStatus
                  ? (pickupOnly ? "Solo tomamos pedidos en el local." : onlineConfig.closedMessage)
                  : undefined
              }
              aria-disabled={disabledByStatus || loading || submitting}
            >
              {disabledByStatus
                ? (isTableMode ? "Mesa no habilitada" : pickupOnly ? "Solo en el local" : "Local cerrado")
                : (justAdded ? "Agregado ✔" : "Agregar al Carrito")}
            </Button>
          </div>
        </div>
      </div>

      {/* Overlay bloqueante: si tenés loading real */}
      <BlockingLoader open={loading} message="Cargando combo..." />
    </div>
  );
}
