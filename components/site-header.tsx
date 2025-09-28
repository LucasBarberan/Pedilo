"use client";

import { ShoppingCart, ChevronLeft } from "lucide-react";
import { useCart } from "@/components/cart-context";
import Link from "next/link";
import Image from "next/image";

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || "SRA. BURGA";
const STORE_LOGO = process.env.NEXT_PUBLIC_STORE_LOGO || "";

type Props = {
  showBack?: boolean;
  onBack?: () => void;
  onCartClick?: () => void;
  title?: string; // opcional
};

export default function SiteHeader({
  showBack,
  onBack,
  onCartClick,
  title,
}: Props) {
  const { getTotalItems } = useCart();

  return (
    <div
      className="
        bg-[var(--brand-color)] text-primary-foreground
        flex items-center justify-between
        h-[72px] px-3 sm:px-4    /* altura fija y padding horizontal */
      "
    >
      {/* Back */}
      <button
        onClick={onBack}
        className={`
          relative rounded-full p-2 sm:p-2.5 bg-white/10 hover:bg-white/20 ring-1 ring-white/30 group
          focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70
          ${showBack ? "" : "opacity-0 pointer-events-none"}
        `}
        aria-label="Volver"
        title="Volver"
      >
        <ChevronLeft className="h-6 w-6 text-black group-hover:text-white" strokeWidth={2.25} />
      </button>

      {/* Centro: Logo grande o fallback de texto */}
      <h1 className="flex-1 flex justify-center">
        <Link
          href="/"
          aria-label="Ir al inicio"
          title="Inicio"
          className="
            inline-flex items-center justify-center
            px-0 h-auto bg-transparent rounded-none ring-0
            hover:opacity-95 transition
            focus:outline-none
            focus-visible:outline-2 focus-visible:outline-white/70 focus-visible:outline-offset-2
          "
        >
          {STORE_LOGO ? (
            <Image
              src={STORE_LOGO}
              alt={STORE_NAME}
              width={240}
              height={64}
              priority
              className="
                object-contain
                max-h-[56px] sm:max-h-[64px]
                w-auto
              "
            />
          ) : (
            <span className="font-extrabold uppercase text-white/95 text-lg sm:text-xl tracking-wide">
              {title ?? STORE_NAME}
            </span>
          )}
        </Link>
      </h1>

      {/* Carrito */}
      {onCartClick ? (
        <button
          onClick={onCartClick}
          className="
            relative rounded-full p-2 sm:p-2.5 bg-white/10 hover:bg-white/20 ring-1 ring-white/30 group
            focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70
          "
          aria-label="Carrito"
          title="Carrito"
        >
          <ShoppingCart className="h-6 w-6 text-black group-hover:text-white" />
          {getTotalItems() > 0 && (
            <span
              className="
                absolute -top-1.5 -right-1.5 rounded-full
                min-w-[18px] h-[18px] px-[4px]
                flex items-center justify-center
                text-[10px] font-bold
                bg-black/80 text-white shadow-sm ring-2 ring-black/20
              "
              aria-live="polite"
            >
              {getTotalItems()}
            </span>
          )}
        </button>
      ) : (
        <div className="w-[40px] sm:w-[44px]" />
      )}
    </div>
  );
}
