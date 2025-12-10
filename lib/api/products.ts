export type ProductOption = {
  id: string | number;
  precio_extra?: number | string | null;
  isDefault?: boolean | null;
  option?: {
    id: string | number;
    name?: string | null;
    tipo?: string | null;  // "Tamaño", "Extra", etc.
    description?: string | null;
  };
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
  // 👇 NUEVO: para agrupar por subcategoría
  subcategoryId?: number | null;
  subcategory?: {
    id: number;
    name: string;
    categoryId: number;
    description?: string | null;
  } | null;
};

type FetchProductsOptions = {
  baseUrl?: string | null;
  signal?: AbortSignal;
  page?: number;
  limit?: number;
  includeInactive?: boolean;
};

function extractProductsArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
      // Soporta { success, data: { data: [...] , pagination } }
      return ((data as { data?: unknown }).data as unknown[]) ?? [];
    }
  }
  return [];
}

function parseNumber(input: unknown): number | undefined {
  if (typeof input === "number") return Number.isFinite(input) ? input : undefined;
  if (typeof input === "string" && input.trim() !== "") {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeProductOption(raw: any): ProductOption | null {
  if (!raw) return null;

  const id = raw.id ?? raw.optionId ?? raw.option_id ?? raw.code ?? raw.uuid;
  if (id === undefined || id === null) return null;

  const extraRaw =
    raw.precio_extra ??
    raw.precioExtra ??
    raw.extraPrice ??
    raw.priceExtra ??
    raw.additionalPrice ??
    raw.extra ??
    null;
  const extraParsed = parseNumber(extraRaw);

  const option =
    raw.option && typeof raw.option === "object"
      ? {
          id: raw.option.id ?? raw.optionId ?? raw.option_id ?? raw.option?.code ?? raw.option?.uuid ?? id,
          name: raw.option.name ?? raw.option.label ?? raw.option.descripcion ?? null,
          tipo: raw.option.tipo ?? raw.option.type ?? null,
          description: raw.option.description ?? raw.option.desc ?? null,
        }
      : undefined;

  return {
    id,
    precio_extra: extraParsed ?? (typeof extraRaw === "string" ? extraRaw : extraRaw ?? null),
    isDefault: raw.isDefault ?? raw.default ?? raw.is_default ?? null,
    option,
  };
}

export function normalizeProduct(raw: any): Product | null {
  if (!raw) return null;

  const id = raw.id ?? raw.code ?? raw.slug ?? raw.uuid;
  const name = raw.name ?? raw.title;
  if (id === undefined || id === null || !name) return null;

  const priceCandidate = raw.price ?? raw.basePrice ?? raw.finalPrice ?? raw.unitPrice;
  const price = parseNumber(priceCandidate);

  const imageUrl = typeof raw.imageUrl === "string"
    ? raw.imageUrl
    : typeof raw.image === "string"
      ? raw.image
      : null;

  const optionsRaw: unknown[] | null = Array.isArray(raw.productOptions)
    ? raw.productOptions
    : Array.isArray(raw.product_options)
      ? raw.product_options
      : null;

  const productOptions = optionsRaw
    ? optionsRaw
        .map((opt) => normalizeProductOption(opt))
        .filter((opt): opt is ProductOption => Boolean(opt))
    : undefined;

  // 👇 NUEVO: normalizar subcategoría (viene en tu payload)
  const subcat =
    raw.subcategory && typeof raw.subcategory === "object"
      ? {
          id: Number(raw.subcategory.id),
          name: String(raw.subcategory.name ?? ""),
          categoryId: Number(raw.subcategory.categoryId),
          description: typeof raw.subcategory.description === "string" ? raw.subcategory.description : undefined,
        }
      : null;

  const subcategoryId = raw.subcategoryId != null
    ? Number(raw.subcategoryId)
    : subcat
      ? subcat.id
      : undefined;

  return {
    id,
    name: String(name),
    description: typeof raw.description === "string" ? raw.description : undefined,
    price,
    imageUrl,
    categoryId: raw.categoryId ?? raw.category_id ?? raw.category?.id,
    code: raw.code ?? null,
    isActive: raw.isActive ?? raw.active ?? null,
    productOptions,

    // 👇 NUEVO
    subcategoryId: Number.isFinite(subcategoryId) ? (subcategoryId as number) : null,
    subcategory: subcat,
  };
}

export function normalizeProductsPayload(payload: unknown, { includeInactive = false }: { includeInactive?: boolean } = {}): Product[] {
  const arr = extractProductsArray(payload);
  const normalized: Product[] = [];
  for (const item of arr) {
    const prod = normalizeProduct(item);
    if (!prod) continue;
    if (!includeInactive && prod.isActive === false) continue;
    normalized.push(prod);
  }
  return normalized;
}

export async function fetchProductsByCategory(
  categoryId: string | number,
  { baseUrl, signal, page = 1, limit = 50, includeInactive = false }: FetchProductsOptions = {}
): Promise<Product[]> {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!base) return [];

  try {
    const search = new URLSearchParams({
      category: String(categoryId),
      page: String(page),
      limit: String(limit),
    });

    const res = await fetch(`${base}/products?${search.toString()}`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) return [];

    const json = await res.json();
    return normalizeProductsPayload(json, { includeInactive });
  } catch {
    return [];
  }
}
export async function fetchProductsBySubcategory(
  subcategoryId: string | number,
  { baseUrl, signal, page = 1, limit = 50, includeInactive = false }: FetchProductsOptions = {}
): Promise<Product[]> {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!base) return [];

  try {
    const search = new URLSearchParams({
      subcategory: String(subcategoryId),
      page: String(page),
      limit: String(limit),
    });

    const res = await fetch(`${base}/products?${search.toString()}`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) return [];

    const json = await res.json();
    return normalizeProductsPayload(json, { includeInactive });
  } catch {
    return [];
  }
}

type FetchProductByIdOptions = {
  baseUrl?: string | null;
  signal?: AbortSignal;
};

export async function fetchProductById(
  productId: string | number,
  { baseUrl, signal }: FetchProductByIdOptions = {}
): Promise<Product | null> {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!base) return null;

  try {
    const res = await fetch(`${base}/products/${encodeURIComponent(String(productId))}`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;

    const json = await res.json();
    const raw =
      json && typeof json === "object" && "data" in json && json.data && !Array.isArray((json as any).data)
        ? (json as any).data
        : json && typeof (json as any)?.data === "object" && !Array.isArray((json as any).data?.data)
          ? (json as any).data.data
          : json;

    return normalizeProduct(raw) ?? null;
  } catch {
    return null;
  }
}


