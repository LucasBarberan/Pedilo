// components/site-header.tsx
"use client";

import { ShoppingCart,ChevronLeft  } from "lucide-react";
import { useCart } from "@/components/cart-context";
import Link from "next/link";

// 👇 nombre por defecto desde .env.local
const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || "SRA. BURGA";

type Props = {
  showBack?: boolean;
  onBack?: () => void;
  onCartClick?: () => void;
  title?: string; // opcional, por si querés mostrar algo distinto al nombre de la empresa
};

export default function SiteHeader({
  showBack,
  onBack,
  onCartClick,
  title,
}: Props) {
  const { getTotalItems } = useCart();

  return (
    //<div className="bg-primary text-primary-foreground p-4 flex items-center justify-between">
    <div className="bg-[var(--brand-color)] text-primary-foreground p-4 flex items-center justify-between">
      {/* back */}
      <button
        onClick={onBack}
        className={`relative rounded-full p-2 bg-white/10 hover:bg-white/20 ring-1 ring-white/30 group 
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70
                    ${showBack ? "" : "opacity-0 pointer-events-none"}`}
        aria-label="Volver"
        title="Volver"
      >
        <ChevronLeft className="h-5 w-5 text-black group-hover:text-white" strokeWidth={2.25} />
      </button>

      {/* título centro (empresa por defecto) */}
      <h1 className="text-lg sm:text-xl font-extrabold uppercase text-center">
      <Link
        href="/"
        className="inline-block rounded-full px-3 py-1.5
                  bg-white/10 hover:bg-white/20
                  ring-1 ring-white/30
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70
                  transition"
        aria-label="Ir al inicio"
        title="Inicio"
      >
        {title ?? STORE_NAME}
      </Link>
    </h1>

      {/* carrito (si no pasás onCartClick, dejamos un spacer para alinear) */}
      {onCartClick ? (
        <button
          onClick={onCartClick}
          className="relative rounded-full p-2 bg-white/10 hover:bg-white/20 ring-1 ring-white/30 group"
          aria-label="Carrito"
          title="Carrito"
        >
          <ShoppingCart className="h-5 w-5 text-black group-hover:text-white"  />
          {getTotalItems() > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 rounded-full min-w-[18px] h-[18px] px-[4px]
                          flex items-center justify-center text-[10px] font-bold
                          bg-black/80 text-white shadow-sm ring-2 ring-black/20"
              aria-live="polite"
            >
              {getTotalItems()}
            </span>
          )}
        </button>
      ) : (
        <div className="w-10" />
      )}
    </div>
  );
}
