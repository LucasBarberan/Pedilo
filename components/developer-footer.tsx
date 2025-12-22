"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { Mail, MessageCircle } from "lucide-react"

type Props = {
  scrollRootId?: string
}

export function DeveloperFooter({ scrollRootId }: Props) {
  const DEVELOPER_NAME = "Keltron"
  const DEVELOPER_EMAIL = "soporte@keltron.app"
  const DEVELOPER_WHATSAPP = "3537604893"
  const DEVELOPER_WEBSITE = "keltron.app"

  const sentinelRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState<"floating" | "inline">("inline")

  const rootEl = useMemo(() => {
    if (!scrollRootId) return null
    if (typeof document === "undefined") return null
    return document.getElementById(scrollRootId) as HTMLElement | null
  }, [scrollRootId])

  // Detecta si hay scroll real (contenido más alto que la vista)
  useEffect(() => {
    const root = rootEl
    if (!root) return
    
    const FOOTER_PADDING = 112 // px (equivale aprox a pb-28)
    
    const updateMode = () => {
      const diff = root.scrollHeight - root.clientHeight
    
      // Si hay scroll “real”, usamos el footer flotante
      const nextMode = diff > 80 ? "floating" : "inline"
      setMode(nextMode)
    
      // 👇 manejar padding dinámicamente
      if (nextMode === "floating") {
        root.style.paddingBottom = `${FOOTER_PADDING}px`
      } else {
        root.style.paddingBottom = ""
      }
    }
  
    updateMode()
  
    const ro = new ResizeObserver(updateMode)
    ro.observe(root)
  
    return () => {
      ro.disconnect()
      // cleanup por seguridad
      root.style.paddingBottom = ""
    }
  }, [rootEl])

  // Modo floating: aparece al llegar al final
  useEffect(() => {
    if (mode !== "floating") {
      setVisible(false)
      return
    }

    const sentinel = sentinelRef.current
    const root = rootEl
    if (!sentinel || !root) return

    const io = new IntersectionObserver(
      (entries) => {
        setVisible(entries[0]?.isIntersecting ?? false)
      },
      {
        root,
        threshold: 0.01,
        rootMargin: "0px 0px 120px 0px",
      }
    )

    io.observe(sentinel)
    return () => io.disconnect()
  }, [mode, rootEl])

  const FooterContent = (
    <div className="container mx-auto px-2 sm:px-3 py-2 md:py-2.5">
      <div className="flex items-center gap-2 sm:gap-4 text-sm md:text-base text-muted-foreground">
        <div className="flex items-center flex-shrink-0">
          <Image
            src="/Keltron_logo.png"
            alt="Keltron Logo"
            width={48}
            height={48}
            className="object-contain h-14 w-14 sm:h-16 sm:w-16"
          />
        </div>

        <div className="flex flex-1 min-w-0 flex-col items-center justify-center gap-1 sm:gap-1.5 text-center">
          <div className="flex items-center justify-center gap-1.5 flex-wrap leading-tight">
            <span className="text-sm md:text-base">Desarrollado por</span>
            {DEVELOPER_WEBSITE ? (
              <a
                href={DEVELOPER_WEBSITE}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-foreground hover:text-primary transition-colors underline-offset-4 hover:underline text-sm md:text-base"
              >
                {DEVELOPER_NAME}
              </a>
            ) : (
              <span className="font-semibold text-foreground text-sm md:text-base">
                {DEVELOPER_NAME}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 md:gap-4">
            <a
              href={`mailto:${DEVELOPER_EMAIL}?subject=Reporte de error - Keltron Go&body=Hola, encontré un error en la aplicación:%0D%0A%0D%0A[Describe el error aquí]`}
              className="hover:text-primary transition-colors inline-flex items-center gap-1.5 min-h-[44px] px-1 text-xs md:text-sm whitespace-nowrap"
              title="Reportar un error en la aplicación"
            >
              <Mail className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
              <span>Reportar error</span>
            </a>

            <span className="text-muted-foreground/40 hidden sm:inline">•</span>

            <a
              href={`https://wa.me/${DEVELOPER_WHATSAPP}?text=Hola, estoy interesado en utilizar esta app para mi negocio.`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors inline-flex items-center gap-1.5 min-h-[44px] px-1 text-xs md:text-sm whitespace-nowrap"
              title="Solicitar esta app para tu negocio"
            >
              <MessageCircle className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
              <span>¿Querés esta app?</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Sentinel SIEMPRE al final del contenido (esto está dentro del contenedor scrolleable) */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />

      {mode === "inline" ? (
        // ✅ Modo lista corta: footer normal, no tapa nada y siempre se ve
        <footer className="mt-6 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          {FooterContent}
        </footer>
      ) : (
        // ✅ Modo lista larga: footer flotante que aparece al llegar al final
        <footer
          className={`
            fixed bottom-0 left-0 right-0 z-40
            border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60
            transition-transform duration-300 ease-out
            ${visible ? "translate-y-0" : "translate-y-full"}
          `}
        >
          {FooterContent}
        </footer>
      )}
    </>
  )
}
