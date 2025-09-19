// components/site-header.tsx
"use client";

import { ShoppingCart } from "lucide-react";
import { useCart } from "@/components/cart-context";

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
        className={`rounded-full px-3 py-1 bg-white/10 hover:bg-white/20 ${
          showBack ? "" : "opacity-0 pointer-events-none"
        }`}
        aria-label="Volver"
      >
        ←
      </button>

      {/* título centro (empresa por defecto) */}
      <h1 className="text-lg sm:text-xl font-extrabold uppercase text-center">
        {title ?? "SRA. BURGA"}
      </h1>

      {/* carrito (si no pasás onCartClick, dejamos un spacer para alinear) */}
      {onCartClick ? (
        <button
          onClick={onCartClick}
          className="relative rounded-full p-2 bg-white/10 hover:bg-white/20"
          aria-label="Carrito"
          title="Carrito"
        >
          <ShoppingCart className="h-5 w-5" />
          {getTotalItems() > 0 && (
            <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] rounded-full h-4 w-4 flex items-center justify-center font-bold">
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
