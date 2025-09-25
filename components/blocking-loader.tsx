"use client";

import Image from "next/image";
import { useEffect } from "react";

type Props = {
  open: boolean;
  imageSrc?: string;     // /brand/loader-logo.png en /public
  message?: string;
  zIndex?: number;       // por si necesitás elevarlo
};

export default function BlockingLoader({
  open,
  imageSrc = "/brand/SraBurga.png",
  message = "Cargando…",
  zIndex = 9999,
}: Props) {
  // Evitar scroll del body mientras está abierto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex }}
    >
      {/* Backdrop gris + blur */}
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" />

      {/* Tarjeta central */}
      <div className="relative z-10 w-[320px] max-w-[86vw] rounded-2xl p-6
                      bg-white/85 ring-1 ring-black/10 shadow-xl text-center select-none">
        <div className="relative mx-auto h-28 w-28 overflow-hidden rounded-xl bg-neutral-100 animate-[float_2.4s_ease-in-out_infinite]">
          <Image src={imageSrc} alt="Cargando" fill className="object-contain" priority />
        </div>

        <div className="mt-4 text-sm font-medium text-neutral-700">{message}</div>

        {/* Dots loader */}
        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="loader-dot h-2.5 w-2.5 rounded-full bg-[var(--brand-color)]" />
          <span className="loader-dot h-2.5 w-2.5 rounded-full bg-[var(--brand-color)]" />
          <span className="loader-dot h-2.5 w-2.5 rounded-full bg-[var(--brand-color)]" />
        </div>
      </div>
    </div>
  );
}
