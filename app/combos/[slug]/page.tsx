// app/combos/[slug]/page.tsx
"use client";

import SiteHeader from "@/components/site-header";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart-context";

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

type ApiCombo = {
  id: number | string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  effectivePrice?: number | string | null;
  basePrice?: number | string | null;
  items?: ApiComboItem[];
};

// ===== Helpers =====
const toNum = (v: unknown) =>
  typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;

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

export default function ComboDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { addToCart } = useCart();

  const [combo, setCombo] = useState<ApiCombo | null>(null);
  const [mainProduct, setMainProduct] = useState<ApiProduct | null>(null);
  const [loading, setLoading] = useState(true);

  // UI state (igual que en producto)
  const [selectedOptId, setSelectedOptId] = useState<string | number | null>(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!slug || !BASE) return;

    (async () => {
      setLoading(true);
      try {
        // 1) Traer el combo
        const res = await fetch(
          `${BASE}/combo/${encodeURIComponent(String(slug))}?withEffectivePrice=true`,
          { cache: "no-store" }
        );
        const json = await res.json().catch(() => null);
        const c: ApiCombo | null =
          json && typeof json === "object" && "data" in json ? (json.data as ApiCombo) : (json as ApiCombo | null);

        setCombo(c ?? null);

        // 2) Si hay item principal, traigo el producto para obtener sus opciones
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

            // preselección (default o primera)
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
      } catch {
        setCombo(null);
        setMainProduct(null);
        setSelectedOptId(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  // opción seleccionada
  const selectedOption = useMemo(() => {
    if (!mainProduct?.productOptions?.length) return undefined;
    return mainProduct.productOptions.find((o) => o.id === selectedOptId);
  }, [mainProduct, selectedOptId]);

  // precios
  const comboBase = toNum(combo?.effectivePrice ?? combo?.basePrice);
  const optionExtra = toNum(selectedOption?.precio_extra);
  const total = (comboBase + optionExtra) * qty;

  // items
  const mainItem = useMemo(() => combo?.items?.find((i) => i.isMain), [combo]);
  const extras = useMemo(() => (combo?.items ?? []).filter((i) => !i.isMain), [combo]);

 const handleAdd = () => {
  if (!combo) return;

  // opción seleccionada del principal (si existe)
  const sizeLabelRaw = (selectedOption?.option?.name || "").trim();
  const sizeLabel = sizeLabelRaw.toLowerCase();

  // precios (forzamos number siempre)
  const base = toNum(combo?.effectivePrice ?? combo?.basePrice);
  const extra = toNum(selectedOption?.precio_extra);
  const unit = base + extra;
  const final = unit * qty;

  // imagen: combo -> principal -> vacío
  const img =
    (combo.imageUrl && combo.imageUrl.trim() ? combo.imageUrl : "") ||
    (mainProduct?.imageUrl && mainProduct.imageUrl.trim() ? mainProduct.imageUrl : "") ||
    "";

  // detalle de lo que incluye el combo (principal primero, luego agregados)
  const comboItems = (combo.items ?? [])
    .slice()
    .sort((a, b) => (a.isMain === b.isMain ? 0 : a.isMain ? -1 : 1))
    .map((i) => ({
      name: i.product?.name ?? "Ítem",
      quantity: i.quantity ?? 1,
      isMain: !!i.isMain,
      // sólo el principal muestra la opción elegida (Simple/Doble/Triple)
      optionName: i.isMain ? (sizeLabelRaw || undefined) : undefined,
    }));

  addToCart({
    uniqueId: `${combo.id}-${selectedOptId ?? "noopt"}-${Date.now()}`,
    id: Number(combo.id) || 0,               // id del COMBO
    name: combo.name || "Combo",             // nombre del combo
    description: mainProduct?.description || combo.description || "",
    price: unit,                             // unitario
    finalPrice: final,                       // unit * qty
    image: img,
    category: "combo",
    quantity: qty,

    // visual/orden
    size: sizeLabel || undefined,            // ahora tu CartItem acepta string
    observations: notes,

    // metadatos de combo
    kind: "combo",
    comboName: combo.name,
    comboItems,

    // para backend (option_ids)
    productOptionId: Number(selectedOption?.id) || undefined,
    optionId: Number(selectedOption?.option?.id) || undefined,
    optionName: sizeLabelRaw || undefined,
    priceExtra: extra,

    // combos no son “default category”
    isDefaultCategory: false,
  });

  setJustAdded(true);
  setTimeout(() => setJustAdded(false), 1200);
  setNotes("");
  setQty(1);
  // router.push("/carrito"); // si querés redirigir
};

  // ===== Render =====
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader showBack onBack={() => router.back()} onCartClick={() => router.push("/carrito")} />
        <div className="h-[6px] w-full bg-white" />
        <div className="mx-auto w-full max-w-6xl p-4">Cargando…</div>
      </div>
    );
  }

  if (!combo) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader showBack onBack={() => router.back()} onCartClick={() => router.push("/carrito")} />
        <div className="h-[6px] w-full bg-white" />
        <div className="mx-auto w-full max-w-6xl p-4">No se encontró el combo.</div>
      </div>
    );
  }

  const hasOptions =
    Array.isArray(mainProduct?.productOptions) && (mainProduct!.productOptions!.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader showBack onBack={() => router.back()} onCartClick={() => router.push("/carrito")} />
      <div className="h-[6px] w-full bg-white" />

      <div className="mx-auto w-full max-w-6xl p-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Izquierda: Título del combo (arriba) + imagen + nombre del producto principal */}
        <div className="space-y-3">
          <h2 className="text-xl font-extrabold uppercase">{combo.name}</h2>

          <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 bg-white/60">
            <div className="relative w-full aspect-[4/3]">
              <Image
                src={combo.imageUrl && combo.imageUrl.trim() ? combo.imageUrl : "/placeholder.svg"}
                alt={combo.name}
                fill
                className="object-cover"
              />
            </div>
          </div>

          <h3 className="text-xl font-extrabold uppercase">
            {mainProduct?.name ?? combo.name}
          </h3>

          {(mainProduct?.description || combo.description) && (
            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3 text-sm text-muted-foreground">
              {mainProduct?.description ?? combo.description}
            </div>
          )}
        </div>

        {/* Derecha: opciones (del producto principal) + incluye + cantidad + obs + total */}
        <div className="space-y-4">
          {hasOptions && (
            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3 space-y-2">
              <div className="text-sm font-semibold mb-2">Tamaño:</div>
              {mainProduct!.productOptions!.map((o) => {
                const active = selectedOptId === o.id;
                const plus = toNum(o.precio_extra);
                return (
                  <button
                    key={String(o.id)}
                    onClick={() => setSelectedOptId(o.id)}
                    className={[
                      "w-full rounded-lg border px-3 py-2 text-left flex items-center justify-between",
                      active ? "border-[#ea562f] bg-[#fff5f2]" : "border-transparent hover:bg-black/5",
                    ].join(" ")}
                  >
                    <span className="text-sm">{o.option?.name || "Opción"}</span>
                    <span className="text-sm font-semibold">{plus ? `+${fmt(plus)}` : ""}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="rounded-2xl ring-1 ring-[#ea562f]/40 bg-white/60 p-3">
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

          <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
            <div className="text-sm font-semibold mb-2">Cantidad:</div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                −
              </Button>
              <div className="w-8 text-center font-semibold">{qty}</div>
              <Button variant="outline" onClick={() => setQty((q) => q + 1)}>
                ＋
              </Button>
            </div>
          </div>

          <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
            <div className="text-sm font-semibold mb-2">Observaciones:</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Escribe aquí cualquier observación especial para tu pedido..."
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ea562f]"
            />
          </div>

          <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">Total:</div>
              <div className="text-xl font-extrabold text-[#ea562f]">{fmt(total)}</div>
            </div>
            <Button className="w-full" onClick={handleAdd}>
              {justAdded ? "Agregado ✔" : "Agregar al carrito"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
