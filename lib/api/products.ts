export type Product = {
  id: string | number;
  name: string;
  description?: string;
  price?: number;
  imageUrl?: string | null;
  categoryId?: string | number;
  code?: string | number;
  isActive?: boolean | null;
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
      return ((data as { data?: unknown }).data as unknown[]) ?? [];
    }
  }
  return [];
}

function parseNumber(input: unknown): number | undefined {
  if (typeof input === "number") return Number.isFinite(input) ? input : undefined;
  if (typeof input === "string") {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeProduct(raw: any): Product | null {
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

  return {
    id,
    name: String(name),
    description: typeof raw.description === "string" ? raw.description : undefined,
    price,
    imageUrl,
    categoryId: raw.categoryId ?? raw.category_id ?? raw.category?.id,
    code: raw.code ?? null,
    isActive: raw.isActive ?? raw.active ?? null,
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
