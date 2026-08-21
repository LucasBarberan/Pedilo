"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DeveloperFooter } from "@/components/developer-footer";

type FooterCtx = { hide: () => void; show: () => void };
const FooterContext = createContext<FooterCtx>({ hide: () => {}, show: () => {} });

/** Llamar con shouldHide=true en páginas full-screen para ocultar el footer de LayoutShell. */
export function useHideLayoutFooter(shouldHide: boolean) {
  const { hide, show } = useContext(FooterContext);
  useEffect(() => {
    if (!shouldHide) return;
    hide();
    return () => { show(); };
  }, [shouldHide, hide, show]);
}

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [footerHidden, setFooterHidden] = useState(false);
  const hide = useCallback(() => setFooterHidden(true), []);
  const show = useCallback(() => setFooterHidden(false), []);

  return (
    <FooterContext.Provider value={{ hide, show }}>
      <div id="app-scroll" className="flex-1 overflow-auto flex flex-col">
        {children}
        {!footerHidden && <DeveloperFooter />}
      </div>
    </FooterContext.Provider>
  );
}
