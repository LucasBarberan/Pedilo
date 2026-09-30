"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/** Cookie corta que setea /mesa/[token] para indicar "acaba de escanear el QR". */
const WELCOME_COOKIE = "pedilo_welcome";
/** Duración fija del splash (decisión de diseño: no configurable). */
const DURATION_MS = 5000;
const FADE_MS = 250;

type Phase = "open" | "closing" | "closed";

type Props = {
  title: string;
  message: string;
};

/**
 * Modal de bienvenida breve sobre el menú. Se cierra solo a los 5 s, o al
 * instante con un toque/clic o Escape. No bloquea la carga del menú: se
 * renderiza encima de contenido ya presente. Ver
 * openspec/changes/welcome-splash-table-qr.
 */
export function WelcomeSplash({ title, message }: Props) {
  const [phase, setPhase] = useState<Phase>("open");
  const [logoVisible, setLogoVisible] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const labelId = useId();

  const cleanTitle = title.trim();
  const cleanMessage = message.trim();

  const close = useCallback(() => {
    setPhase((p) => (p === "open" ? "closing" : p));
  }, []);

  // Una sola vez por escaneo: consumir la cookie, foco, timer y Escape.
  useEffect(() => {
    document.cookie = `${WELCOME_COOKIE}=; Max-Age=0; path=/`;
    dialogRef.current?.focus();

    // El <img> viene en el HTML del servidor: si fallo antes de hidratar, React
    // nunca recibe su evento `error`, asi que se comprueba el estado actual.
    const logo = logoRef.current;
    if (logo && logo.complete && logo.naturalWidth === 0) setLogoVisible(false);

    const timer = setTimeout(close, DURATION_MS);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close]);

  // Fade de salida y desmontaje lógico.
  useEffect(() => {
    if (phase !== "closing") return;
    const timer = setTimeout(() => setPhase("closed"), FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // Bloquear el scroll del body solo mientras el splash es visible.
  const visible = phase !== "closed";
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (!visible || (!cleanTitle && !cleanMessage)) return null;

  return (
    <div
      className="welcome-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-9 backdrop-blur-[2px]"
      data-phase={phase}
      onClick={close}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
        className="welcome-card w-full max-w-sm rounded-3xl bg-white px-6 pb-[22px] pt-8 text-center shadow-2xl outline-none"
      >
        {logoVisible && (
          <div className="mx-auto mb-[22px] flex h-20 w-20 items-center justify-center overflow-hidden rounded-[22px] bg-[#FDF8F4] ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={logoRef}
              src="/brand/logo.png"
              alt=""
              className="h-full w-full object-contain p-2"
              onError={() => setLogoVisible(false)}
            />
          </div>
        )}

        {cleanTitle && (
          <h1
            id={labelId}
            className="welcome-fu break-words text-[28px] font-extrabold uppercase leading-[1.12] text-[#2b2b2b]"
            style={{ animationDelay: "0.3s" }}
          >
            {cleanTitle}
          </h1>
        )}

        {cleanMessage && (
          <p
            id={cleanTitle ? undefined : labelId}
            className={`welcome-fu whitespace-pre-line break-words text-[17px] leading-normal text-[#2b2b2b] ${
              cleanTitle ? "mt-3.5" : ""
            }`}
            style={{ animationDelay: "0.5s" }}
          >
            {cleanMessage}
          </p>
        )}

        <div
          className="mx-auto mt-[26px] h-1 w-24 overflow-hidden rounded-full bg-[#ece3dc]"
          aria-hidden="true"
        >
          <div
            className="welcome-bar h-full rounded-full"
            style={
              {
                backgroundColor: "var(--brand-color)",
                // la barra dura lo mismo que el timer: una sola fuente de verdad
                "--welcome-duration": `${DURATION_MS}ms`,
              } as React.CSSProperties
            }
          />
        </div>
        <p className="welcome-hint mt-3 text-sm font-medium text-[#6b635d]">Tocá para continuar</p>
      </div>
    </div>
  );
}
