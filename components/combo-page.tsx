// app/combos/[slug]/page.tsx
"use client";

import SiteHeader from "@/components/site-header";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
import type { Combo as ApiCombo, ComboCategoryInclusion as CategoryInclusion } from "@/lib/api/combos";
import type { Product as ApiProduct, ModifierGroup, ModifierGroupOption } from "@/lib/api/products";
import { quoteCombo, buildPromoLabel, type QuoteComboItem } from "@/lib/pricing";

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

  // 💰 precios cotizados por el servidor (por unidad de combo)
  const [quotedEffective, setQuotedEffective] = useState<number | null>(null);
  const [quotedList, setQuotedList] = useState<number | null>(null);
  const [quoteHasPromo, setQuoteHasPromo] = useState(false);
  const [quoteIsFromPriceList, setQuoteIsFromPriceList] = useState(false);
  const [promoLabel, setPromoLabel] = useState<string | null>(null);

  // Igual que en producto: estado comercial
  const { data: status } = useBusinessStatusSmart();
  const { config: onlineConfig } = useOnlineConfig();
  const isWebOpen = status?.web?.open ?? true; // mientras carga, asumimos abierto
  const pickupOnly = !!(status?.pos?.open && status?.web?.open === false);
  const disabledByStatus = !isWebOpen;

  const loading = false; // si en tu caso hay fetch para combo, actualizá este flag

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
      let next = current.includes(prodId)
        ? current.filter((x) => x !== prodId)
        : [...current, prodId];

      if (next.length > max) next = next.slice(0, max);
      return { ...prev, [key]: next };
    });

    setInclusionErrors((e) => ({ ...e, [key]: null }));
    setFormError(null);
  };

  // precios
  const baseList = toNum(combo?.basePrice);
  const baseEff = toNum(combo?.effectivePrice ?? combo?.basePrice);
  const optionExtra = selectedEntries.reduce((sum, { option, qty: optQty }) => sum + toNum(option.precio_extra) * optQty, 0);
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

    const comboItems = (combo.items ?? [])
      .slice()
      .sort((a, b) => (a.isMain === b.isMain ? 0 : a.isMain ? -1 : 1))
      .map((i) => ({
        productId: Number(i.productId),
        name: i.product?.name ?? "Ítem",
        qty: Number(i.quantity ?? 1),
        isMain: !!i.isMain,
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
                </div>
                {group.options.map((o) => {
                  const optQty = qtyMap.get(o.id) ?? 0;
                  const active = optQty > 0;
                  const plus = toNum(o.precio_extra);
                  const usesStepper = !!group.allowsQuantity;
                  return (
                    <div
                      key={String(o.id)}
                      onClick={!usesStepper ? () => toggleOption(group, o.id) : undefined}
                      role={!usesStepper ? (isRadio ? "radio" : "checkbox") : undefined}
                      aria-checked={!usesStepper ? active : undefined}
                      className={[
                        "w-full rounded-lg border px-3 py-2 flex items-center justify-between transition-colors",
                        !usesStepper ? "cursor-pointer" : "",
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
                            <span className="text-sm font-semibold text-slate-500">+{fmt(plus)}/u</span>
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
                        <span className="text-sm font-semibold">
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
          <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
            <div className="text-sm font-semibold mb-2">Incluye:</div>
            {extras.length === 0 ? (
              <div className="text-sm text-muted-foreground">— Sin agregados —</div>
            ) : (
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
            )}
          </div>

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
              onClick={isWebOpen ? handleAdd : undefined}
              disabled={disabledByStatus || loading || submitting}
              title={
                disabledByStatus
                  ? (pickupOnly ? "Solo tomamos pedidos en el local." : onlineConfig.closedMessage)
                  : undefined
              }
              aria-disabled={disabledByStatus || loading || submitting}
            >
              {disabledByStatus
                ? (pickupOnly ? "Solo en el local" : "Local cerrado")
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
