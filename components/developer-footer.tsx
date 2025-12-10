"use client"

import Image from "next/image"
import { Mail, MessageCircle } from "lucide-react"

/**
 * Developer Footer Component
 *
 * Discreto footer que incluye información de contacto del desarrollador
 * para reportar errores o solicitar desarrollo de apps similares.
 *
 * Características UX/UI:
 * - No intrusivo: Usa colores sutiles y tipografía pequeña
 * - Accesible: Contraste adecuado, touch targets de 44px mínimo
 * - Responsive: Se adapta a móvil y desktop
 * - Semántico: Usa elemento <footer> HTML5
 */
export function DeveloperFooter() {
  // Configuración - Actualizar con datos reales
  const DEVELOPER_NAME = "Keltron"
  const DEVELOPER_EMAIL = "soporte@keltron.app"
  const DEVELOPER_WHATSAPP = "3537604893" // Sin '+' ni espacios
  const DEVELOPER_WEBSITE = "keltron.app" // Opcional

  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
      <div className="container mx-auto px-2 sm:px-3 py-2 md:py-2.5">
        <div className="flex items-center gap-2 sm:gap-4 text-sm md:text-base text-muted-foreground">
          {/* Columna izquierda: logo */}
          <div className="flex items-center flex-shrink-0">
            <Image
              src="/Keltron_logo.png"
              alt="Keltron Logo"
              width={48}
              height={48}
              className="object-contain h-14 w-14 sm:h-16 sm:w-16"
            />
          </div>

          {/* Columna derecha: texto + CTA */}
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
                <span className="font-semibold text-foreground text-sm md:text-base">{DEVELOPER_NAME}</span>
              )}
            </div>

            {/* Call-to-action con enlaces */}
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
    </footer>
  )
}
