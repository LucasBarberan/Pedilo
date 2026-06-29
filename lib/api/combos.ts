import { isAllowedForDelivery } from "@/lib/channel";
import type { Product } from "@/lib/api/products";
import { normalizeProduct, fetchProductById } from "@/lib/api/products";

export type ComboItem = {
  id: string | number;
  comboId?: string | number | null;
  productId?: string | number | null;
  quantity?: number | null;
  isMain?: boolean | null;
  product?: Product | null;
};

export type ComboCategoryInclusion = {
  id: string | number;
  comboId?: string | number | null;
  categoryId?: string | number | null;
  subcategoryId?: string | number | null;
  name?: string | null;
  minChoices?: number | null;
  maxChoices?: number | null;
  pricingMode?: string | null;
  percentOff?: number | null;
  amountOff?: number | null;
  fixedPrice?: number | null;
  priceCap?: number | null;
  surchargeIfAboveCap?: boolean | null;
  category?: {
    id?: string | number | null;
    name?: string | null;
    isComboCategory?: boolean | null;
  };
  subcategory?: {                                         // 👈 NUEVO
    id?: string | number | null;
    name?: string | null;
    categoryId?: string | number | null;
  } | null;
};

export type ComboModifierOverride = {
  modifierOptionId: number;
  isEnabled: boolean;
  extraOverride: number | null;
  productTemplateId?: number | null;
};

export type ModifierGroupRuleExpanded = {
  modifierGroupId: number;
  includedFreeCount: number;
};

export type ComboSlotExpanded = {
  comboItemId: number;
  slotIndex: number;
  slotOrder: number;
  product: {
    id: number;
    name: string;
    modifierGroups: Array<{
      id: number;
      name: string;
      isRequired: boolean;
      minSelections: number;
      maxSelections: number;
      allowsQuantity?: boolean;
      options: Array<{
        id: number;
        name: string;
        priceExtra?: number | null;
        isDefault?: boolean;
      }>;
    }>;
  };
  modifierGroupRules: ModifierGroupRuleExpanded[];
};

export type SlotSelection = {
  comboItemId: number;
  slotIndex: number;
  selectedByGroup: Map<number, Set<number>>;
  comment: string;
};

export type Combo = {
  id: string | number;
  name: string;
  description?: string;
  imageUrl?: string | null;
  basePrice?: number | null;
  effectivePrice?: number | null;
  promoLabel?: string | null;
  active?: boolean | null;
  channel?: string | null;
  categoryId?: string | number | null;
  categoryName?: string | null;
  category?: {
    id?: string | number | null;
    name?: string | null;
    isComboCategory?: boolean | null;
  };
  items?: ComboItem[];
  slots?: ComboSlotExpanded[];
  categoryInclusions?: ComboCategoryInclusion[];
  modifierOverrides?: ComboModifierOverride[];
  activePromoLabels?: string[];
};

type FetchCombosBaseOptions = {
  baseUrl?: string | null;
  signal?: AbortSignal;
  withItems?: boolean;
  withCategoryInclusions?: boolean;
  withEffectivePrice?: boolean;
  page?: number;
  limit?: number;
};

type FetchCombosOptions = FetchCombosBaseOptions & {
  categoryId?: string | number;
  onlyActive?: boolean;
  onlyDeliveryAllowed?: boolean;
  onlyComboCategory?: boolean;
};

type FetchComboByIdOptions = FetchCombosBaseOptions;

type FetchComboDetailOptions = {
  baseUrl?: string | null;
  signal?: AbortSignal;
};

function parseNullableNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractComboArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
      return ((data as { data?: unknown }).data as unknown[]) ?? [];
    }
  }
  return [];
}

function normalizeSlot(raw: any): ComboSlotExpanded | null {
  if (!raw) return null;
  const comboItemId = Number(raw.comboItemId ?? raw.combo_item_id);
  if (!Number.isFinite(comboItemId)) return null;

  const rawProduct = raw.product ?? {};
  const groups = Array.isArray(rawProduct.modifierGroups) ? rawProduct.modifierGroups : [];

  return {
    comboItemId,
    slotIndex: Number(raw.slotIndex ?? raw.slot_index ?? 0),
    slotOrder: Number(raw.slotOrder ?? raw.slot_order ?? 0),
    product: {
      id: Number(rawProduct.id ?? 0),
      name: String(rawProduct.name ?? ""),
      modifierGroups: groups.map((g: any) => ({
        id: Number(g.id),
        name: String(g.name ?? ""),
        isRequired: g.isRequired ?? g.is_required ?? false,
        minSelections: Number(g.minSelections ?? g.min_selections ?? 1),
        maxSelections: Number(g.maxSelections ?? g.max_selections ?? 1),
        allowsQuantity: g.allowsQuantity ?? g.allows_quantity ?? false,
        options: Array.isArray(g.options) ? g.options.map((o: any) => ({
          id: Number(o.id),
          name: String(o.name ?? ""),
          priceExtra: parseNullableNumber(o.priceExtra ?? o.price_extra ?? o.extra),
          isDefault: o.isDefault ?? o.is_default ?? false,
        })) : [],
      })),
    },
    modifierGroupRules: Array.isArray(raw.modifierGroupRules)
      ? raw.modifierGroupRules.map((r: any) => ({
          modifierGroupId: Number(r.modifierGroupId ?? r.modifier_group_id),
          includedFreeCount: Number(r.includedFreeCount ?? r.included_free_count ?? 0),
        }))
      : [],
  };
}

function normalizeComboItem(raw: any): ComboItem | null {
  if (!raw) return null;

  const id = raw.id ?? raw.itemId ?? raw.comboItemId ?? raw.uuid;
  if (id === undefined || id === null) return null;

  const product = raw.product ? normalizeProduct(raw.product) : null;

  return {
    id,
    comboId: raw.comboId ?? raw.combo_id ?? raw.comboID ?? null,
    productId: raw.productId ?? raw.product_id ?? product?.id ?? null,
    quantity: parseNullableNumber(raw.quantity ?? raw.qty),
    isMain: raw.isMain ?? raw.main ?? raw.is_main ?? null,
    product,
  };
}

function normalizeComboCategoryInclusion(raw: any): ComboCategoryInclusion | null {
  if (!raw) return null;

  const id = raw.id ?? raw.comboCategoryInclusionId ?? raw.uuid;
  if (id === undefined || id === null) return null;

  const categoryId = raw.categoryId ?? raw.category_id ?? raw.category?.id ?? null;
  const subcategoryId = raw.subcategoryId ?? raw.subcategory_id ?? raw.subcategory?.id ?? null;

  return {
    id,
    comboId: raw.comboId ?? raw.combo_id ?? raw.comboID ?? null,
    categoryId,
    subcategoryId,
    name: typeof raw.name === "string"
        ? raw.name
        : raw.subcategory?.name ?? raw.category?.name ?? null,
    minChoices: parseNullableNumber(raw.minChoices ?? raw.min_choices),
    maxChoices: parseNullableNumber(raw.maxChoices ?? raw.max_choices),
    pricingMode: raw.pricingMode ?? raw.pricing_mode ?? null,
    percentOff: parseNullableNumber(raw.percentOff ?? raw.percent_off),
    amountOff: parseNullableNumber(raw.amountOff ?? raw.amount_off),
    fixedPrice: parseNullableNumber(raw.fixedPrice ?? raw.fixed_price),
    priceCap: parseNullableNumber(raw.priceCap ?? raw.price_cap),
    surchargeIfAboveCap: raw.surchargeIfAboveCap ?? raw.surcharge_if_above_cap ?? null,
    category: raw.category && typeof raw.category === "object"
      ? {
          id: raw.category.id ?? raw.category_id ?? raw.category.code ?? raw.category.uuid ?? categoryId,
          name: raw.category.name ?? raw.category.title ?? null,
          isComboCategory: raw.category.isComboCategory ?? raw.category.is_combo_category ?? null,
        }
      : undefined,
      subcategory:
      raw.subcategory && typeof raw.subcategory === "object"
        ? {
            id: raw.subcategory.id ?? raw.subcategory_id ?? raw.subcategory.code ?? raw.subcategory.uuid ?? subcategoryId,
            name: raw.subcategory.name ?? raw.subcategory.title ?? null,
            categoryId: raw.subcategory.categoryId ?? raw.subcategory.category_id ?? categoryId ?? null,
          }
        : (subcategoryId ? { id: subcategoryId, name: null, categoryId: categoryId ?? null } : null),
  };
}

function normalizeCombo(raw: any): Combo | null {
  if (!raw) return null;

  const id = raw.id ?? raw.code ?? raw.slug ?? raw.uuid;
  const name = raw.name ?? raw.title;
  if (id === undefined || id === null || !name) return null;

  const basePrice = parseNullableNumber(raw.basePrice ?? raw.base_price ?? raw.price);
  const effectivePrice = parseNullableNumber(raw.effectivePrice ?? raw.effective_price ?? raw.finalPrice ?? raw.unitPrice);

  const imageUrl = typeof raw.imageUrl === "string"
    ? raw.imageUrl
    : typeof raw.image === "string"
      ? raw.image
      : null;

  const descriptionSource =
    raw.description ??
    raw.summary ??
    raw.shortDescription ??
    raw.subtitle ??
    raw.details ??
    raw.descripcion ??
    raw.mainProductDescription ??
    raw.mainProduct?.description ??
    null;
  let description = typeof descriptionSource === "string" ? descriptionSource : undefined;

  const category = raw.category && typeof raw.category === "object"
    ? {
        id: raw.category.id ?? raw.category_id ?? raw.category.code ?? raw.category.uuid ?? null,
        name: raw.category.name ?? raw.category.title ?? null,
        isComboCategory: raw.category.isComboCategory ?? raw.category.is_combo_category ?? null,
      }
    : undefined;

  const itemsRaw: unknown[] = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw.comboItems)
      ? raw.comboItems
      : [];
  const items = itemsRaw
    .map((item) => normalizeComboItem(item))
    .filter((item): item is ComboItem => Boolean(item));

  const inclusionsRaw: unknown[] = Array.isArray(raw.categoryInclusions)
    ? raw.categoryInclusions
    : Array.isArray(raw.comboCategoryInclusions)
      ? raw.comboCategoryInclusions
      : [];
  const categoryInclusions = inclusionsRaw
    .map((inc) => normalizeComboCategoryInclusion(inc))
    .filter((inc): inc is ComboCategoryInclusion => Boolean(inc));

  const overridesRaw: any[] = Array.isArray(raw.optionOverrides) ? raw.optionOverrides : [];
  const modifierOverrides: ComboModifierOverride[] = overridesRaw
    .filter((o) => o && o.modifierOptionId != null)
    .map((o) => ({
      modifierOptionId: Number(o.modifierOptionId),
      isEnabled: o.isEnabled !== false,
      extraOverride: parseNullableNumber(o.extraOverride ?? o.extra_override),
      productTemplateId: o.productTemplateId != null ? Number(o.productTemplateId) : null,
    }));

  const slotsRaw: any[] = Array.isArray(raw.slots) ? raw.slots : [];
  const slots: ComboSlotExpanded[] = slotsRaw
    .map(normalizeSlot)
    .filter((s): s is ComboSlotExpanded => s !== null);

  if (!description) {
    const main = items.find((item) => item?.isMain && typeof item?.product?.description === "string" && item.product.description.trim());
    const first = items.find((item) => typeof item?.product?.description === "string" && item.product.description.trim());
    description = (main?.product?.description ?? first?.product?.description)?.trim() || undefined;
  }

  return {
    id,
    name: String(name),
    description,
    imageUrl,
    basePrice,
    effectivePrice,
    promoLabel: typeof raw.promoLabel === "string" ? raw.promoLabel : null,
    active: raw.active ?? raw.isActive ?? null,
    channel: raw.channel ?? raw.availableChannel ?? null,
    categoryId: raw.categoryId ?? raw.category_id ?? category?.id ?? null,
    categoryName: category?.name ?? null,
    category,
    items,
    slots: slots.length > 0 ? slots : undefined,
    categoryInclusions,
    modifierOverrides,
    activePromoLabels: Array.isArray(raw.activePromoLabels) ? raw.activePromoLabels : undefined,
  };
}

export function normalizeCombosPayload(payload: unknown): Combo[] {
  const arr = extractComboArray(payload);
  const normalized: Combo[] = [];
  for (const item of arr) {
    const combo = normalizeCombo(item);
    if (combo) normalized.push(combo);
  }
  return normalized;
}

export async function fetchCombos({
  baseUrl,
  signal,
  categoryId,
  onlyActive = false,
  onlyDeliveryAllowed = false,
  onlyComboCategory = false,
}: FetchCombosOptions = {}): Promise<Combo[]> {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!base) return [];

  const url = `${base}/catalog/combos?channel=WEB`;

  try {
    const res = await fetch(url, { cache: "no-store", signal });
    if (!res.ok) return [];

    const json = await res.json();
    const combos = normalizeCombosPayload(json);

    return combos.filter((combo) => {
      if (onlyActive && combo.active === false) return false;
      if (onlyDeliveryAllowed && !isAllowedForDelivery(combo.channel)) return false;
      if (onlyComboCategory && combo.category?.isComboCategory !== true) return false;
      if (categoryId !== undefined && categoryId !== null) {
        const current = combo.categoryId ?? combo.category?.id;
        if (String(current ?? "") !== String(categoryId)) return false;
      }
      return true;
    });
  } catch {
    return [];
  }
}

export async function fetchComboById(
  id: string | number,
  {
    baseUrl,
    signal,
    withItems = false,
    withCategoryInclusions = false,
    withEffectivePrice = true,
  }: FetchComboByIdOptions = {}
): Promise<Combo | null> {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!base) return null;

  const search = new URLSearchParams();
  if (withItems) search.set("withItems", "true");
  if (withCategoryInclusions) search.set("withCategoryInclusions", "true");
  if (withEffectivePrice) {
    search.set("withEffectivePrice", "true");
    search.set("pricingChannel", "WEB");
  }

  const qs = search.toString();
  const url = `${base}/combo/${encodeURIComponent(String(id))}${qs ? `?${qs}` : ""}`;

  try {
    const res = await fetch(url, { cache: "no-store", signal });
    if (!res.ok) return null;

    const json = await res.json();
    const raw =
      json && typeof json === "object" && "data" in json && json.data && !Array.isArray((json as any).data)
        ? (json as any).data
        : json && typeof (json as any)?.data === "object" && !Array.isArray((json as any).data?.data)
          ? (json as any).data.data
          : json;

    return normalizeCombo(raw);
  } catch {
    return null;
  }
}

export async function fetchComboDetail(
  comboId: string | number,
  { baseUrl, signal }: FetchComboDetailOptions = {}
): Promise<{
  combo: Combo | null;
  mainProduct: Product | null;
  inclusionProducts: Record<string, Product[]>;
}> {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!base) return { combo: null, mainProduct: null, inclusionProducts: {} };

  try {
    const res = await fetch(
      `${base}/catalog/combos/${encodeURIComponent(String(comboId))}?channel=WEB&withInclusionProducts=true`,
      { cache: "no-store", signal }
    );
    if (!res.ok) return { combo: null, mainProduct: null, inclusionProducts: {} };

    const json = await res.json();
    const raw = json?.data ?? json;
    if (!raw) return { combo: null, mainProduct: null, inclusionProducts: {} };

    const combo = normalizeCombo(raw);
    if (!combo) return { combo: null, mainProduct: null, inclusionProducts: {} };

    // mainProduct: hidratar desde items con modifiers
    const mainItem = (combo.items ?? []).find((item) => item?.isMain);
    let mainProduct = mainItem?.product ?? null;
    const mainProductId = mainItem?.productId;

    const needsHydration =
      mainProductId !== undefined &&
      mainProductId !== null &&
      (!mainProduct ||
        !Array.isArray(mainProduct.modifierGroups) ||
        mainProduct.modifierGroups.length === 0);

    if (needsHydration) {
      const fetched = await fetchProductById(mainProductId, { baseUrl, signal, comboId: Number(comboId) });
      if (fetched) {
        mainProduct = mainProduct
          ? {
              ...mainProduct,
              ...fetched,
              productOptions: fetched.productOptions ?? mainProduct.productOptions,
              modifierGroups: fetched.modifierGroups ?? mainProduct.modifierGroups,
            }
          : fetched;
      }
    }

    // inclusionProducts ya vienen pre-hidratados del backend
    const rawInclusionProducts = raw.inclusionProducts ?? {};
    const inclusionProducts: Record<string, Product[]> = {};
    for (const [key, minimalProducts] of Object.entries(rawInclusionProducts)) {
      inclusionProducts[key] = (minimalProducts as any[])
        .map((p: any) => normalizeProduct(p))
        .filter((p): p is Product => p !== null && p.isActive !== false);
    }

    return { combo, mainProduct, inclusionProducts };
  } catch {
    return { combo: null, mainProduct: null, inclusionProducts: {} };
  }
}







