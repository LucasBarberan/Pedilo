export type ProductOption = {
  id: string | number;
  precio_extra?: number | string | null;
  isDefault?: boolean | null;
  activatesPromo?: { label: string } | null;
  option?: {
    id: string | number;
    name?: string | null;
    tipo?: string | null;
    description?: string | null;
  };
};

// Grupo de modificadores genérico (N grupos, no solo "Tamaño"/"Extra").
// Refleja 1:1 lo que devuelve Backend/src/services/catalog.service.ts -> buildModifierGroupsFromTemplate.
export type ModifierGroupOption = {
  id: number;
  name: string;
  precio_extra: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  maxQuantity?: number | null;
  recipeId?: number | null;
  activatesPromo?: { label: string } | null;
};

export type ModifierGroup = {
  id: number;
  name: string;
  applicableTo?: string | null;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
  allowsQuantity: boolean;
  options: ModifierGroupOption[];
};

export type Product = {
  id: string | number;
  name: string;
  description?: string;
  price?: number;
  imageUrl?: string | null;
  categoryId?: string | number;
  code?: string | number;
  isActive?: boolean | null;
  productOptions?: ProductOption[];
  modifierGroups?: ModifierGroup[];
  subcategoryId?: number | null;
  subcategory?: {
    id: number;
    name: string;
    categoryId: number;
    description?: string | null;
  } | null;
  promoLabel?: string | null;
  basePrice?: number | null;
  activePromoLabels?: string[];
  // Opciones gratuitas incluidas por grupo cuando el producto se vende suelto
  // (independiente de la regla que ese mismo producto tenga dentro de un combo).
  modifierGroupRules?: Array<{ modifierGroupId: number; includedFreeCount: number }>;
};

type FetchProductsOptions = {
  baseUrl?: string | null;
  signal?: AbortSignal;
  page?: number;
  limit?: number;
  includeInactive?: boolean;
};

type FetchProductByIdOptions = {
  baseUrl?: string | null;
  signal?: AbortSignal;
  comboId?: number | null;
};

function parseNumber(input: unknown): number | undefined {
  if (typeof input === "number") return Number.isFinite(input) ? input : undefined;
  if (typeof input === "string" && input.trim() !== "") {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

// Normaliza un TemplateModifierOption del nuevo backend al shape ProductOption de Pedilo.
// El id resultante es ModifierOption.id, que es el valor correcto para option_ids en /pricing/quote.
function normalizeProductOptionFromTMO(tmo: any): ProductOption | null {
  if (!tmo) return null;
  if (tmo.isActive === false) return null;
  const opt = tmo.option;
  if (!opt || opt.isActive === false) return null;

  return {
    id: opt.id,
    precio_extra: Number(tmo.priceExtra ?? tmo.price_extra ?? 0),
    isDefault: tmo.isDefaultOverride || (opt.isDefault ?? false),
    activatesPromo: tmo.activatesPromo ?? null,
    option: {
      id: opt.id,
      name: opt.name ?? null,
      tipo: opt.group?.name ?? null,
      description: null,
    },
  };
}

// Normaliza el array `modifierGroups` que devuelve /catalog/products/:id (detalle).
// Cruza `activatesPromo` desde template.templateModifierOptions (por optionId), ya que
// buildModifierGroupsFromTemplate en el backend no lo incluye dentro de cada grupo.
function normalizeModifierGroups(raw: any): ModifierGroup[] {
  const rawGroups: any[] = Array.isArray(raw?.modifierGroups) ? raw.modifierGroups : [];
  if (rawGroups.length === 0) return [];

  const promoByOptionId = new Map<number, { label: string }>();
  const tmos: any[] = raw?.template?.templateModifierOptions ?? [];
  for (const tmo of tmos) {
    if (tmo?.activatesPromo) promoByOptionId.set(Number(tmo.optionId), tmo.activatesPromo);
  }

  return rawGroups
    .map((g): ModifierGroup => ({
      id: Number(g.id),
      name: String(g.name ?? ""),
      applicableTo: g.applicableTo ?? null,
      isRequired: !!g.isRequired,
      minSelections: Number(g.minSelections ?? 0),
      maxSelections: Number(g.maxSelections ?? 1),
      sortOrder: Number(g.sortOrder ?? 0),
      allowsQuantity: !!g.allowsQuantity,
      options: (Array.isArray(g.options) ? g.options : [])
        .filter((o: any) => o.isActive !== false)
        .map((o: any): ModifierGroupOption => ({
          id: Number(o.id),
          name: String(o.name ?? ""),
          precio_extra: Number(o.priceExtra ?? 0),
          isDefault: !!o.isDefault,
          isActive: o.isActive !== false,
          sortOrder: Number(o.sortOrder ?? 0),
          maxQuantity: o.maxQuantity ?? null,
          recipeId: o.recipeId ?? null,
          activatesPromo: promoByOptionId.get(Number(o.id)) ?? null,
        }))
        .sort((a: ModifierGroupOption, b: ModifierGroupOption) => a.sortOrder - b.sortOrder),
    }))
    .filter((g) => g.options.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// Normaliza una respuesta de ProductSKU del backend al tipo Product de Pedilo.
// raw puede traer template.templateModifierOptions cuando se obtiene vía el detalle.
export function normalizeProduct(raw: any): Product | null {
  if (!raw) return null;

  const id = raw.id;
  const name = raw.name ?? raw.template?.name;
  if (id === undefined || id === null || !name) return null;

  // price puede ser un número (legacy) o CatalogPriceView
  const isPriceObj = raw.price && typeof raw.price === "object";
  const price = isPriceObj
    ? parseNumber(raw.price.finalUnitPrice ?? raw.price.effectivePrice ?? raw.price.basePrice)
    : parseNumber(raw.price);
  const promoLabel = isPriceObj ? (raw.price.promoLabel ?? null) : null;
  const basePrice = isPriceObj ? (parseNumber(raw.price.basePrice) ?? null) : null;

  const imageUrl =
    typeof raw.imageUrl === "string"
      ? raw.imageUrl
      : typeof raw.template?.imageUrl === "string"
      ? raw.template.imageUrl
      : null;

  const categoryId = raw.categoryId ?? raw.category?.id ?? raw.template?.categoryId ?? null;

  const rawSubcatId =
    raw.subcategoryId != null
      ? raw.subcategoryId
      : raw.template?.subcategoryId != null
      ? raw.template.subcategoryId
      : null;
  const subcategoryId =
    rawSubcatId != null && Number.isFinite(Number(rawSubcatId))
      ? Number(rawSubcatId)
      : null;

  const rawSubcat = raw.subcategory ?? raw.template?.subcategory ?? null;
  const subcategory =
    rawSubcat && typeof rawSubcat === "object"
      ? {
          id: Number(rawSubcat.id),
          name: String(rawSubcat.name ?? ""),
          categoryId: Number(rawSubcat.categoryId),
          description:
            typeof rawSubcat.description === "string"
              ? rawSubcat.description
              : null,
        }
      : null;

  // Modifiers desde templateModifierOptions (CONFIGURABLE/SIMPLE)
  const tmos: any[] = raw.template?.templateModifierOptions ?? [];
  const productOptions: ProductOption[] = tmos
    .filter((tmo) => tmo.isActive !== false && tmo.option?.isActive !== false)
    .sort((a, b) => {
      const ga = a.option?.group?.sortOrder ?? 0;
      const gb = b.option?.group?.sortOrder ?? 0;
      if (ga !== gb) return ga - gb;
      return (a.option?.sortOrder ?? 0) - (b.option?.sortOrder ?? 0);
    })
    .map(normalizeProductOptionFromTMO)
    .filter((o): o is ProductOption => o !== null);

  const modifierGroups = normalizeModifierGroups(raw);

  return {
    id,
    name: String(name),
    description:
      typeof raw.description === "string"
        ? raw.description
        : typeof raw.template?.description === "string"
        ? raw.template.description
        : undefined,
    price,
    imageUrl,
    categoryId,
    code: raw.code ?? null,
    isActive: raw.isActive ?? true,
    productOptions: productOptions.length > 0 ? productOptions : undefined,
    modifierGroups: modifierGroups.length > 0 ? modifierGroups : undefined,
    subcategoryId,
    subcategory,
    promoLabel,
    basePrice,
    activePromoLabels: Array.isArray(raw.activePromoLabels) ? raw.activePromoLabels : undefined,
    modifierGroupRules: Array.isArray(raw.modifierGroupRules) ? raw.modifierGroupRules : undefined,
  };
}

export async function fetchProductsByCategory(
  categoryId: string | number,
  { baseUrl, signal, page = 1, limit = 20 }: FetchProductsOptions = {}
): Promise<Product[]> {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!base) return [];

  try {
    const search = new URLSearchParams({
      channel: "WEB",
      categoryId: String(categoryId),
      page: String(page),
      limit: String(limit),
    });
    const res = await fetch(`${base}/catalog/products?${search}`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) return [];

    const json = await res.json();
    const catalogData = json?.data ?? json;
    const items: any[] = Array.isArray(catalogData?.items) ? catalogData.items : [];

    return items
      .filter((item: any) => (item?.type === "simple" || item?.type === "configurable") && item.product)
      .map((item: any) => normalizeProduct(item.product))
      .filter((p): p is Product => p !== null);
  } catch {
    return [];
  }
}

export async function fetchProductsBySubcategory(
  subcategoryId: string | number,
  { baseUrl, signal, includeInactive = false }: FetchProductsOptions = {}
): Promise<Product[]> {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!base) return [];

  try {
    const search = new URLSearchParams({ isActive: "true", limit: "200" });
    const res = await fetch(`${base}/product-skus?${search}`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) return [];

    const json = await res.json();
    const arr: any[] = Array.isArray(json?.data?.data)
      ? json.data.data
      : Array.isArray(json?.data)
      ? json.data
      : [];

    const subId = Number(subcategoryId);
    return arr
      .filter((sku) => {
        if (!includeInactive && sku.isActive === false) return false;
        return Number(sku.template?.subcategoryId) === subId;
      })
      .map(normalizeProduct)
      .filter((p): p is Product => p !== null);
  } catch {
    return [];
  }
}

export async function fetchProductById(
  productId: string | number,
  { baseUrl, signal, comboId }: FetchProductByIdOptions = {}
): Promise<Product | null> {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!base) return null;

  try {
    const qs = comboId != null ? `&comboId=${comboId}` : "";
    const res = await fetch(
      `${base}/catalog/products/${encodeURIComponent(String(productId))}?channel=WEB${qs}`,
      { cache: "no-store", signal }
    );
    if (!res.ok) return null;

    const json = await res.json();
    const raw = json?.data ?? json;
    if (!raw?.id) return null;

    return normalizeProduct(raw) ?? null;
  } catch {
    return null;
  }
}

export function normalizeProductsPayload(
  payload: unknown,
  { includeInactive = false }: { includeInactive?: boolean } = {}
): Product[] {
  const arr: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.data?.data)
    ? (payload as any).data.data
    : Array.isArray((payload as any)?.data)
    ? (payload as any).data
    : [];

  const normalized: Product[] = [];
  for (const item of arr) {
    const prod = normalizeProduct(item);
    if (!prod) continue;
    if (!includeInactive && prod.isActive === false) continue;
    normalized.push(prod);
  }
  return normalized;
}
