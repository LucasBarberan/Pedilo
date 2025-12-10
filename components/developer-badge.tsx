"use client"

import { useState, useEffect } from "react"
import { Info, X, Mail, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Developer Badge Component (Opcional)
 *
 * Badge flotante en esquina inferior derecha que se expande al hacer click.
 * Incluye opción de "No mostrar más" que se guarda en localStorage.
 *
 * Características UX/UI:
 * - Discreto: Pequeño badge circular que se expande on-demand
 * - Controlable: Usuario puede ocultarlo permanentemente
 * - Animado: Transiciones suaves y animaciones de entrada
 * - No intrusivo: Se posiciona fuera del área de interacción principal
 *
 * Uso recomendado:
 * - Solo en páginas de bajo engagement (home, categorías)
 * - NO usar en carrito ni checkout
 */
export function DeveloperBadge() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isVisible, setIsVisible] = useState(true)

  // Configuración - Actualizar con datos reales
  const DEVELOPER_NAME = "Tu Nombre o Marca"
  const DEVELOPER_EMAIL = "contacto@ejemplo.com"
  const DEVELOPER_WHATSAPP = "123456789" // Sin '+' ni espacios

  const STORAGE_KEY = "dev-badge-hidden"

  // Verificar localStorage al montar
  useEffect(() => {
    const isHidden = localStorage.getItem(STORAGE_KEY)
    if (isHidden === "true") {
      setIsVisible(false)
    }
  }, [])

  // Función para ocultar permanentemente
  const hidePermanently = () => {
    localStorage.setItem(STORAGE_KEY, "true")
    setIsVisible(false)
  }

  // No renderizar si está oculto permanentemente
  if (!isVisible) return null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isExpanded ? (
        // Estado colapsado: Badge circular con icono
        <button
          onClick={() => setIsExpanded(true)}
          className="h-12 w-12 rounded-full bg-background/80 backdrop-blur border shadow-lg hover:shadow-xl transition-all flex items-center justify-center text-muted-foreground hover:text-primary hover:scale-105 active:scale-95"
          aria-label="Información del desarrollador"
        >
          <Info className="h-5 w-5" />
        </button>
      ) : (
        // Estado expandido: Card con información y enlaces
        <Card className="w-72 shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <CardTitle className="text-sm">Desarrollado por {DEVELOPER_NAME}</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 -mt-1 -mr-1"
                onClick={() => setIsExpanded(false)}
                aria-label="Cerrar"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Creamos aplicaciones personalizadas para negocios como este
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Botón: Reportar error */}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start h-10"
              asChild
            >
              <a
                href={`mailto:${DEVELOPER_EMAIL}?subject=Reporte de error - Pedilo&body=Hola, encontré un error en la aplicación:%0D%0A%0D%0A[Describe el error aquí]`}
              >
                <Mail className="h-3.5 w-3.5 mr-2" />
                Reportar un error
              </a>
            </Button>

            {/* Botón: Solicitar app */}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start h-10"
              asChild
            >
              <a
                href={`https://wa.me/${DEVELOPER_WHATSAPP}?text=Hola, estoy interesado en desarrollar una aplicación similar para mi negocio.`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-3.5 w-3.5 mr-2" />
                Solicitar una app
              </a>
            </Button>

            {/* Opción de ocultar permanentemente */}
            <button
              onClick={hidePermanently}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors pt-2 text-center"
            >
              No mostrar más
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
