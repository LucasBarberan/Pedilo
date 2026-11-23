import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { CartProvider } from "@/components/cart-context"
import { DeveloperFooter } from "@/components/developer-footer"
import { Suspense } from "react"
import LayoutShell from "@/components/layout-shell"
import { TestModeBanner } from "@/components/test-mode-banner"
import { TableOrderProvider } from "@/components/table-order-context"
import { WelcomeSplash } from "@/components/welcome-splash"
import { WelcomeSplashGate } from "@/components/welcome-splash-gate"
import { fetchOnlineConfigFresh } from "@/lib/api/onlineConfig"
import { getRuntimeConfig, toPublicRuntime } from "@/lib/runtimeConfig"
import { safeJsonForScript } from "@/lib/runtimeConfigLoader"
import { RuntimeProvider } from "@/components/runtime-provider"
import { cookies } from "next/headers"
import "./globals.css"
import type { Viewport } from "next";

// La config del cliente depende del Host de CADA visita (change infra-multi-tenant, Fase 4): este layout NO puede prerenderizarse en el
// build, que congelaría la configuración de `single` en el HTML de todos los clientes. Se declara explícito en vez de depender de que
// algún `cookies()`/`headers()` del camino lo vuelva dinámico (en el POS, sin TENANCY_MODE al construir, no lo hace).
export const dynamic = "force-dynamic";

// Marca, título y descripción salen de la configuración del cliente de ESTA visita (change infra-multi-tenant, Fase 4): con una sola
// imagen para todos los clientes ya no pueden ser constantes del build. En single (por defecto) siguen siendo las variables de siempre.
export async function generateMetadata(): Promise<Metadata> {
  const c = await getRuntimeConfig();
  const icon = c.faviconUrl ?? "/favicon.ico?=v2";
  return {
    title: {
      default: c.name,
      template: `%s | ${c.name}`,
    },
    description: c.description ?? undefined,
    openGraph: {
      title: c.name,
      description: c.description ?? undefined,
      url: c.appUrl,
      siteName: c.name,
      locale: "es_AR",
      type: "website",
    },
    icons: { icon, shortcut: icon },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const c = await getRuntimeConfig();
  return { themeColor: c.brandColor };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const runtime = await getRuntimeConfig();
  const cookieStore = await cookies();
  const testModeActive = !!cookieStore.get("pedilo_test_token")?.value;
  const tableModeActive = !!cookieStore.get("pedilo_table_token")?.value;
  // Cookie de 60 s que setea /mesa/[token] solo si el splash está activo.
  const welcomeConfig = cookieStore.get("pedilo_welcome")?.value
    ? await fetchOnlineConfigFresh(undefined, runtime.apiBase)
    : null;
  const showWelcome = !!welcomeConfig?.welcomeSplashOnTableActive;

  return (
    <html lang="es" className="h-full" style={{ "--brand-color": runtime.brandColor } as React.CSSProperties}>
      <head>
        {/* Config pública del cliente para el código del navegador (solo datos que ya se ven en la página). */}
        <script dangerouslySetInnerHTML={{ __html: `window.__RUNTIME__=${safeJsonForScript(toPublicRuntime(runtime))}` }} />
      </head>
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable} h-full flex flex-col`}>
        {testModeActive && <TestModeBanner />}
        <Suspense fallback={null}>
          <RuntimeProvider value={toPublicRuntime(runtime)}>
          <CartProvider>
            <TableOrderProvider initialActive={tableModeActive}>
              <LayoutShell>
                {children}
              </LayoutShell>
              {showWelcome && (
                <WelcomeSplash
                  title={welcomeConfig!.welcomeSplashTitle}
                  message={welcomeConfig!.welcomeSplashMessage}
                />
              )}
              <WelcomeSplashGate tableSplashShown={showWelcome} />
            </TableOrderProvider>
          </CartProvider>
          </RuntimeProvider>
        </Suspense>
      </body>
    </html>
  )
}
