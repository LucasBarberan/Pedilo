"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { WelcomeSplash } from "@/components/welcome-splash";
import { fetchOnlineConfig } from "@/lib/api/onlineConfig";
import { hasSeenWelcome } from "@/lib/welcome-session";

/** Pantallas donde el splash de apertura nunca debe aparecer (error, bloqueo, demo). */
const EXCLUDED_PREFIXES = ["/mesa-no-disponible", "/mesa/", "/demo/"];

function isExcluded(pathname: string | null): boolean {
  if (!pathname) return false;
  return EXCLUDED_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
}

type Props = {
  /** El layout ya montó el splash de mesa en esta carga: no sumar el de apertura. */
  tableSplashShown: boolean;
};

/**
 * Disparador "al abrir la app" del splash de bienvenida: una vez por sesión del
 * navegador. Decide en el cliente (el servidor no ve sessionStorage) y solo
 * consulta la config si todavía no saludó en esta sesión. No bloquea el menú:
 * el splash se monta encima de contenido ya presente. Ver
 * openspec/changes/welcome-splash-always.
 */
export function WelcomeSplashGate({ tableSplashShown }: Props) {
  const pathname = usePathname();
  const [content, setContent] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (tableSplashShown || isExcluded(pathname) || hasSeenWelcome()) return;

    // Sin guarda de "ya ejecuté": en StrictMode el efecto corre dos veces y la primera
    // se cancela. `fetchOnlineConfig` deduplica las llamadas simultáneas.
    let cancelled = false;
    fetchOnlineConfig().then((cfg) => {
      if (cancelled || !cfg.welcomeSplashOnAppOpenActive) return;
      // Revalidar tras el fetch: otra vía pudo saludar mientras tanto.
      if (hasSeenWelcome()) return;
      setContent({ title: cfg.welcomeSplashTitle, message: cfg.welcomeSplashMessage });
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, tableSplashShown]);

  if (!content) return null;
  return <WelcomeSplash title={content.title} message={content.message} />;
}
