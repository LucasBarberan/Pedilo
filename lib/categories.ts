export type Category = {
  id: string | number;
  name: string;
  code?: string | number | null;
  imageUrl?: string | null;
  isDefault?: boolean | null;
  isComboCategory?: boolean | null;
  sortOrder?: number | null;
};

function extractCategoryArray(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") {
    const data = (input as { data?: unknown }).data;
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
      return ((data as { data?: unknown }).data as unknown[]) ?? [];
    }
  }
  return [];
}

function normalizeCategory(raw: any): Category | null {
  if (!raw) return null;

  const id = raw.id ?? raw.code ?? raw.slug ?? raw.uuid;
  const name = raw.name ?? raw.title ?? raw.label;
  if (id === undefined || id === null || !name) return null;

  const asNumber = typeof raw.sortOrder === "number" ? raw.sortOrder : Number(raw.sortOrder);
  const sortOrder = Number.isFinite(asNumber) ? (asNumber as number) : null;

  const imageUrl = typeof raw.imageUrl === "string"
    ? raw.imageUrl
    : typeof raw.image === "string"
      ? raw.image
      : null;

  return {
    id,
    name: String(name),
    code: raw.code ?? null,
    imageUrl,
    isDefault: raw.isDefault ?? null,
    isComboCategory: raw.isComboCategory ?? raw.isCombo ?? null,
    sortOrder,
  };
}

export function normalizeCategoriesPayload(payload: unknown): Category[] {
  const arr = extractCategoryArray(payload);
  const normalized: Category[] = [];
  for (const item of arr) {
    const cat = normalizeCategory(item);
    if (cat) normalized.push(cat);
  }
  return normalized;
}

export function sortCategories(list: Category[]): Category[] {
  const fallback = Number.MAX_SAFE_INTEGER;
  return [...list].sort((a, b) => {
    const aDefault = !!a.isDefault;
    const bDefault = !!b.isDefault;
    if (aDefault !== bDefault) return aDefault ? -1 : 1;

    const aSort = typeof a.sortOrder === "number" ? a.sortOrder : fallback;
    const bSort = typeof b.sortOrder === "number" ? b.sortOrder : fallback;
    if (aSort !== bSort) return aSort - bSort;

    return String(a.name || "").localeCompare(String(b.name || ""), "es");
  });
}

type FetchCategoriesOptions = {
  baseUrl?: string | null;
  signal?: AbortSignal;
};

export async function fetchCategories({ baseUrl, signal }: FetchCategoriesOptions = {}): Promise<Category[]> {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!base) return [];

  try {
    const res = await fetch(`${base}/categories`, { cache: "no-store", signal });
    if (!res.ok) return [];

    const json = await res.json();
    const normalized = normalizeCategoriesPayload(json);
    return sortCategories(normalized);
  } catch {
    return [];
  }
}
