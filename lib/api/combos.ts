import { isAllowedForDelivery } from "@/lib/channel";
import type { Product } from "@/lib/api/products";
import { normalizeProduct, fetchProductById, fetchProductsByCategory } from "@/lib/api/products";

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
};

export type Combo = {
  id: string | number;
  name: string;
  description?: string;
  imageUrl?: string | null;
  basePrice?: number | null;
  effectivePrice?: number | null;
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
  categoryInclusions?: ComboCategoryInclusion[];
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

  return {
    id,
    comboId: raw.comboId ?? raw.combo_id ?? raw.comboID ?? null,
    categoryId,
    name: typeof raw.name === "string" ? raw.name : raw.category?.name ?? null,
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
    active: raw.active ?? raw.isActive ?? null,
    channel: raw.channel ?? raw.availableChannel ?? null,
    categoryId: raw.categoryId ?? raw.category_id ?? category?.id ?? null,
    categoryName: category?.name ?? null,
    category,
    items,
    categoryInclusions,
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
  withItems = false,
  withCategoryInclusions = false,
  withEffectivePrice = true,
  page,
  limit,
  onlyActive = false,
  onlyDeliveryAllowed = false,
  onlyComboCategory = false,
}: FetchCombosOptions = {}): Promise<Combo[]> {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!base) return [];

  const search = new URLSearchParams();
  if (withItems) search.set("withItems", "true");
  if (withCategoryInclusions) search.set("withCategoryInclusions", "true");
  if (withEffectivePrice) search.set("withEffectivePrice", "true");
  if (categoryId !== undefined && categoryId !== null) search.set("category", String(categoryId));
  if (page) search.set("page", String(page));
  if (limit) search.set("limit", String(limit));

  const qs = search.toString();
  const url = `${base}/combo${qs ? `?${qs}` : ""}`;

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
  if (withEffectivePrice) search.set("withEffectivePrice", "true");

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
  const combo = await fetchComboById(comboId, {
    baseUrl,
    signal,
    withItems: true,
    withCategoryInclusions: true,
    withEffectivePrice: true,
  });

  if (!combo) {
    return { combo: null, mainProduct: null, inclusionProducts: {} };
  }

  const mainItem = (combo.items ?? []).find((item) => item?.isMain);
  let mainProduct = mainItem?.product ?? null;
  const mainProductId = mainItem?.productId;

  const needsHydratedMainProduct =
    mainProductId !== undefined &&
    mainProductId !== null &&
    (!mainProduct || !Array.isArray(mainProduct.productOptions) || mainProduct.productOptions.length === 0);

  if (needsHydratedMainProduct) {
    const fetchedMain = await fetchProductById(mainProductId, { baseUrl, signal });
    if (fetchedMain) {
      mainProduct = mainProduct
        ? {
            ...mainProduct,
            ...fetchedMain,
            productOptions: fetchedMain.productOptions ?? mainProduct.productOptions,
          }
        : fetchedMain;
    }
  }

  const inclusionProductsEntries = await Promise.all(
    (combo.categoryInclusions ?? []).map(async (inc) => {
      if (!inc?.id || !inc?.categoryId) return null;
      const products = await fetchProductsByCategory(inc.categoryId, {
        baseUrl,
        signal,
        limit: 100,
        includeInactive: false,
      });
      return [String(inc.id), products.filter((p) => p.isActive !== false)];
    })
  );

  const inclusionProducts: Record<string, Product[]> = {};
  for (const entry of inclusionProductsEntries) {
    if (!entry) continue;
    const [key, products] = entry as [string, Product[]];
    inclusionProducts[key] = products;
  }

  return { combo, mainProduct, inclusionProducts };
}







