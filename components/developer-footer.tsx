"use client"

import Image from "next/image"
import { Mail, MessageCircle } from "lucide-react"

export function DeveloperFooter() {
  const DEVELOPER_NAME = "Keltron"
  const DEVELOPER_EMAIL = "soporte@keltron.app"
  const DEVELOPER_WHATSAPP = "3537604893"
  const DEVELOPER_WEBSITE = "keltron.app"

  return (
    <footer className="mt-auto border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-2 sm:px-3 py-3 md:py-3.5">
        <div className="flex items-center gap-3 sm:gap-4 text-sm text-muted-foreground">
          <div className="flex items-center flex-shrink-0">
            <Image
              src="/Keltron_logo.png"
              alt="Keltron Logo"
              width={40}
              height={40}
              className="object-contain h-10 w-10"
            />
          </div>

          <div className="flex flex-1 min-w-0 flex-col items-center justify-center gap-1 text-center">
            <div className="flex items-center justify-center gap-1.5 flex-wrap leading-tight">
              <span className="text-sm">Desarrollado por</span>
              {DEVELOPER_WEBSITE ? (
                <a
                  href={DEVELOPER_WEBSITE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-foreground hover:text-primary transition-colors underline-offset-2 hover:underline text-sm"
                >
                  {DEVELOPER_NAME}
                </a>
              ) : (
                <span className="font-semibold text-foreground text-sm">
                  {DEVELOPER_NAME}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 text-xs">
              <a
                href={`mailto:${DEVELOPER_EMAIL}?subject=Reporte de error - Keltron Go&body=Hola, encontré un error en la aplicación:%0D%0A%0D%0A[Describe el error aquí]`}
                className="hover:text-primary transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                title="Reportar un error en la aplicación"
              >
                <Mail className="h-3 w-3 flex-shrink-0" />
                <span>Reportar error</span>
              </a>

              <span className="text-muted-foreground/40 hidden sm:inline">•</span>

              <a
                href={`https://wa.me/${DEVELOPER_WHATSAPP}?text=Hola, estoy interesado en utilizar esta app para mi negocio.`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                title="Solicitar esta app para tu negocio"
              >
                <MessageCircle className="h-3 w-3 flex-shrink-0" />
                <span>¿Querés esta app?</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
