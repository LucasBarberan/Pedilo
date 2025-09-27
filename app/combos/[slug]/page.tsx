// app/combos/[slug]/page.tsx
"use client";

import SiteHeader from "@/components/site-header";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart-context";
import ClosedBanner from "@/components/closed-banner";
import { STORE_OPEN, STORE_CLOSED_MSG } from "@/lib/flags";
import { fixImageUrl } from "@/lib/img";
import BlockingLoader from "@/components/blocking-loader";
import { isAllowedForDelivery } from "@/lib/channel";

// ===== Tipos =====
type ApiProductOption = {
  id: string | number;
  precio_extra?: number | string | null;
  isDefault?: boolean;
  option?: { id: string | number; name: string };
};

type ApiProduct = {
  id: number | string;
  name: string;
  description?: string | null;
  price?: number | string | null;
  imageUrl?: string | null;
  productOptions?: ApiProductOption[];
};

type ApiComboItem = {
  id: number | string;
  comboId: number | string;
  productId: number | string;
  quantity: number;
  isMain: boolean;
  product?: ApiProduct | null;
};

type CategoryInclusion = {
  id: number | string;
  comboId: number | string;
  categoryId: number | string;
  name?: string | null;
  minChoices?: number | string | null;
  maxChoices?: number | string | null;
  pricingMode?:
    | "INCLUDED_FREE"
    | "PERCENT_DISCOUNT"
    | "FIXED_DISCOUNT"
    | "PRICE_CAP"
    | "FIXED_PRICE"
    | string
    | null;
  percentOff?: number | string | null;
  amountOff?: number | string | null;
  fixedPrice?: number | string | null;
  priceCap?: number | string | null;
  surchargeIfAboveCap?: boolean | null;
  category?: {
    id: number | string;
    name: string;
    isComboCategory?: boolean;
  };
};

type ApiCombo = {
  id: number | string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  effectivePrice?: number | string | null;
  basePrice?: number | string | null;
  items?: ApiComboItem[];
  categoryInclusions?: CategoryInclusion[];
};

const MAX_NOTES = 50;

// ===== Helpers =====
const toNum = (v: unknown) =>
  typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;

const toNumber = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? (n as number) : null;
};

const toArray = (json: any): any[] =>
  Array.isArray(json) ? json :
  Array.isArray(json?.data) ? json.data :
  Array.isArray(json?.data?.data) ? json.data.data :
  [];

const fmt = (n?: number | string | null) => {
  if (n === null || n === undefined) return "-";
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? `$${(v as number).toLocaleString("es-AR")}` : "-";
};

// ordenar opciones: simple -> doble -> triple; default primero si empatan
const normalize = (s?: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const rankByName = (o: ApiProductOption) => {
  const n = normalize(o.option?.name);
  if (n.includes("simple")) return 0;
  if (n.includes("doble")) return 1;
  if (n.includes("triple")) return 2;
  return 99;
};

const optionSorter = (a: ApiProductOption, b: ApiProductOption) => {
  const ra = rankByName(a);
  const rb = rankByName(b);
  if (ra !== rb) return ra - rb;
  if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
  const ea = Number(a.precio_extra || 0);
  const eb = Number(b.precio_extra || 0);
  return ea - eb;
};

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
      const cap = r.priceCap != null && r.priceCap !== "" ? Number(r.priceCap) : null;
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

export default function ComboDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { addToCart } = useCart();

  // ---------- Estado principal ----------
  const [combo, setCombo] = useState<ApiCombo | null>(null);
  const [mainProduct, setMainProduct] = useState<ApiProduct | null>(null);

  // flags de carga
  const [loading, setLoading] = useState(true);
  const [hasSnapshot, setHasSnapshot] = useState(false); // 👈 si venimos con prefetch

  // inclusiones (categorías incluidas)
  const [inclusionsProducts, setInclusionsProducts] = useState<Record<string, ApiProduct[]>>({});
  const [inclusionSelections, setInclusionSelections] = useState<Record<string, string[]>>({});

  // UI state
  const [selectedOptId, setSelectedOptId] = useState<string | number | null>(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [justAdded, setJustAdded] = useState(false);
  const [openIncId, setOpenIncId] = useState<string | null>(null);
  const [inclusionErrors, setInclusionErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // ---------- Hidratar desde prefetch (si existe) ----------
  useEffect(() => {
    if (!slug) return;
    try {
      const raw = sessionStorage.getItem(`prefetch:combo:${slug}`);
      if (raw) {
        const snap = JSON.parse(raw);
        // armamos un "combo mínimo" para mostrar rápido
        const quick: ApiCombo = {
          id: snap.id,
          name: snap.name,
          description: snap.description ?? "",
          imageUrl: snap.imageUrl ?? "",
          basePrice: snap.basePrice ?? null,
          effectivePrice: snap.effectivePrice ?? null,
          items: [],                // se completa luego
          categoryInclusions: [],   // se completa luego
        };
        setCombo(quick);
        setHasSnapshot(true);
      }
    } catch {
      // sin snapshot
    }
  }, [slug]);

  // ---------- Carga real desde API (reemplaza/ completa el snapshot) ----------
  useEffect(() => {
    const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!slug || !BASE) return;

    (async () => {
      setLoading(true);
      try {
        // 1) Traer combo completo
        const res = await fetch(
          `${BASE}/combo/${encodeURIComponent(String(slug))}?withEffectivePrice=true&withCategoryInclusions=true&withItems=true`,
          { cache: "no-store" }
        );
        const json = await res.json().catch(() => null);
        const c: ApiCombo | null =
          json && typeof json === "object" && "data" in json
            ? (json.data as ApiCombo)
            : (json as ApiCombo | null);

        setCombo(c ?? null);

        // si no permitido para delivery → fuera
        if (c && !isAllowedForDelivery((c as any).channel)) {
          router.replace("/");
        }

        // 2) Producto principal (para opciones)
        const main = c?.items?.find((i) => i.isMain);
        if (main?.productId) {
          const pRes = await fetch(`${BASE}/products/${main.productId}`, { cache: "no-store" });
          if (pRes.ok) {
            const raw = await pRes.json();
            const product: ApiProduct =
              raw && raw.data && !Array.isArray(raw.data)
                ? raw.data
                : raw && raw.data?.data && !Array.isArray(raw.data.data)
                ? raw.data.data
                : raw;

            const ordered =
              product?.productOptions?.length ? [...product.productOptions].sort(optionSorter) : [];
            const prodOrdered: ApiProduct = { ...product, productOptions: ordered };
            setMainProduct(prodOrdered || null);

            const def = ordered.find((o) => o.isDefault);
            setSelectedOptId((def ?? ordered[0])?.id ?? null);
          } else {
            setMainProduct(null);
            setSelectedOptId(null);
          }
        } else {
          setMainProduct(null);
          setSelectedOptId(null);
        }

        // 3) Productos por inclusión
        const inclusions = c?.categoryInclusions ?? [];
        const byInclusion: Record<string, ApiProduct[]> = {};
        const defaultSel: Record<string, string[]> = {};

        for (const inc of inclusions) {
          const catId = inc.categoryId;
          if (!catId) continue;

          const prRes = await fetch(
            `${BASE}/products?category=${encodeURIComponent(String(catId))}&page=1&limit=100`,
            { cache: "no-store" }
          );
          const prJson = await prRes.json();
          const raw: any[] = toArray(prJson);
          const products: ApiProduct[] = raw.map((p: any) => ({
            id: p.id,
            name: p.name,
            price: typeof p.price === "string" ? Number(p.price) : p.price,
            imageUrl: p.imageUrl ?? null,
          }));

          const key = String(inc.id);
          byInclusion[key] = products;
          defaultSel[key] = []; // sin selección por defecto
        }

        setInclusionsProducts(byInclusion);
        setInclusionSelections(defaultSel);
      } catch {
        setCombo(null);
        setMainProduct(null);
        setSelectedOptId(null);
        setInclusionsProducts({});
        setInclusionSelections({});
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, router]);

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

  // opción seleccionada
  const selectedOption = useMemo(() => {
    if (!mainProduct?.productOptions?.length) return undefined;
    return mainProduct.productOptions.find((o) => o.id === selectedOptId);
  }, [mainProduct, selectedOptId]);

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
  const comboBase = toNum(combo?.effectivePrice ?? combo?.basePrice);
  const optionExtra = toNum(selectedOption?.precio_extra);

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
        const final = priceWithInclusionRule(raw, inc);
        if (final) total += final;
      }
    }
    return total;
  }, [combo, inclusionsProducts, inclusionSelections]);

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
        const fin = priceWithInclusionRule(raw, inc) ?? raw;
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
  }, [combo, inclusionsProducts, inclusionSelections]);

  const total = (comboBase + optionExtra + selectedInclusionsTotal) * qty;

  // items
  const mainItem = useMemo(() => combo?.items?.find((i) => i.isMain), [combo]);
  const extras = useMemo(() => (combo?.items ?? []).filter((i) => !i.isMain), [combo]);

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

    const sizeLabelRaw = (selectedOption?.option?.name || "").trim();
    const hasSelected =
      selectedOption != null && selectedOption.id != null && !Number.isNaN(Number(selectedOption.id));

    const base = toNum(combo?.effectivePrice ?? combo?.basePrice);
    const extra = toNum(selectedOption?.precio_extra);
    const unit = base + extra + selectedInclusionsTotal;
    const final = unit * qty;

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
      .map((i) => {
        const item: {
          productId: number;
          name: string;
          qty: number;
          isMain?: boolean;
          option?: { id: number; name: string; extraPrice: number };
        } = {
          productId: Number(i.productId),
          name: i.product?.name ?? "Ítem",
          qty: Number(i.quantity ?? 1),
          isMain: !!i.isMain,
        };

        if (i.isMain && hasSelected) {
          item.option = {
            id: Number(selectedOption!.id),
            name: sizeLabelRaw || "Simple",
            extraPrice: toNum(selectedOption!.precio_extra) || 0,
          };
        }
        return item;
      });

    const inclusionAsItems = selectedInclusionItems.map((s) => ({
      productId: s.productId,
      name: s.name,
      qty: 1,
      isInclusion: true as any,
      inclusionTitle: s.inclusionTitle,
      unitPrice: s.unitPrice,
      basePrice: s.basePrice,
    }));

    addToCart({
      uniqueId: `${combo.id}-${selectedOptId ?? "noopt"}-${Date.now()}`,
      id: Number(combo.id) || 0,
      name: combo.name || "Combo",
      description: mainProduct?.description || combo.description || "",
      price: unit,
      finalPrice: final,
      image: img,
      category: "combo",
      quantity: qty,

      size: sizeLabelRaw ? sizeLabelRaw.toLowerCase() : undefined,
      observations: notes,

      kind: "combo",
      comboName: combo.name,
      comboItems: [...comboItems, ...inclusionAsItems],

      productOptionId: hasSelected ? Number(selectedOption!.id) : undefined,
      optionId: hasSelected ? Number((selectedOption as any).option?.id) : undefined,
      optionName: hasSelected ? sizeLabelRaw : undefined,
      priceExtra: extra,

      isDefaultCategory: false,
    });

    setFormError(null);
    setJustAdded(true);
    setTimeout(() => {
      setJustAdded(false);
      router.back();
    }, 600);
    setNotes("");
    setQty(1);
  };

  if (!combo && !loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader showBack onBack={() => router.back()} onCartClick={() => router.push("/carrito")} />
        <div className="h-[6px] w-full bg-white" />
        <div className="mx-auto w-full max-w-6xl p-4">No se encontró el combo.</div>
      </div>
    );
  }

  const hasOptions =
    Array.isArray(mainProduct?.productOptions) && mainProduct.productOptions.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader showBack onBack={() => router.back()} onCartClick={() => router.push("/carrito")} />
      <div className="h-[6px] w-full bg-white" />
      <ClosedBanner />

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
            {mainProduct?.name ?? combo?.name ?? "Combo"}
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
          {hasOptions && (
            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3 space-y-2">
              <div className="text-sm font-semibold mb-2">Tamaño:</div>
              {mainProduct?.productOptions?.map((o) => {
                const active = selectedOptId === o.id;
                const plus = toNum(o.precio_extra);
                return (
                  <button
                    key={String(o.id)}
                    disabled={loading}
                    onClick={() => setSelectedOptId(o.id)}
                    className={[
                      "w-full rounded-lg border px-3 py-2 text-left flex items-center justify-between",
                      active ? "border-[var(--brand-color)] bg-[#fff5f2]" : "border-transparent hover:bg-black/5",
                    ].join(" ")}
                  >
                    <span className="text-sm">{o.option?.name || "Opción"}</span>
                    <span className="text-sm font-semibold">{plus ? `+${fmt(plus)}` : ""}</span>
                  </button>
                );
              })}
            </div>
          )}

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
                const title = (inc.name || inc.category?.name || "Elige una opción").toLowerCase();

                const optionLabel = (p: any) => {
                  const raw = toNumber(p.price);
                  const fin = priceWithInclusionRule(raw, inc);
                  if (raw === null || fin === null) return p.name;
                  return raw === fin
                    ? `${p.name}  ${fmt(fin)}`
                    : `${p.name}  ${fmt(fin)}  (${fmt(raw)})`;
                };

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
                              if (!p) return "Elegir…";
                              const raw = toNumber(p.price);
                              const fin = priceWithInclusionRule(raw, inc);
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
                                const fin = priceWithInclusionRule(raw, inc);
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
                              const fin = priceWithInclusionRule(raw, inc);
                              const checked = sel.includes(String(p.id));

                              return (
                                <label
                                  key={String(p.id)}
                                  className={`flex items-center justify-between gap-3 rounded-lg border p-2 cursor-pointer ${
                                    checked ? "ring-2 ring-[var(--brand-color)]" : "ring-1 ring-black/5"
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
                {extras.map((it) => (
                  <li key={String(it.id)}>
                    {it.product?.name ?? "Ítem"} {it.quantity > 1 ? `x${it.quantity}` : ""}
                  </li>
                ))}
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
              <div className="text-xl font-extrabold text-[var(--brand-color)]">{fmt(total)}</div>
            </div>
            <Button
              className={`w-full text-white transition-colors
                          bg-[var(--brand-color)]
                          hover:bg-[color-mix(in_srgb,var(--brand-color),#000_12%)]
                          active:bg-[color-mix(in_srgb,var(--brand-color),#000_18%)]
                          hover:brightness-95 active:brightness-90
                          disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none
                          ${!STORE_OPEN ? "opacity-60 cursor-not-allowed pointer-events-none" : ""}`}
              onClick={STORE_OPEN ? handleAdd : undefined}
              disabled={!STORE_OPEN || loading}
              title={!STORE_OPEN ? STORE_CLOSED_MSG : undefined}
              aria-disabled={!STORE_OPEN}
            >
              {!STORE_OPEN ? "Local cerrado" : justAdded ? "Agregado ✔" : "Agregar al Carrito"}
            </Button>
          </div>
        </div>
      </div>

      {/* Overlay bloqueante: solo si NO tengo snapshot */}
      <BlockingLoader open={loading && !hasSnapshot} message="Cargando combo.." />
    </div>
  );
}
