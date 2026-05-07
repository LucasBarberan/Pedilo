import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { CartProvider } from "@/components/cart-context"
import { DeveloperFooter } from "@/components/developer-footer"
import { Suspense } from "react"
import LayoutShell from "@/components/layout-shell"
import "./globals.css"
import type { Viewport } from "next";

const SITE_TITLE = process.env.NEXT_PUBLIC_STORE_NAME ?? "Keltron GO";
const SITE_DESCRIPTION = process.env.NEXT_PUBLIC_STORE_DESCRIPTION ?? "Pedidos online";
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
const BRAND_COLOR = process.env.NEXT_PUBLIC_BRAND_COLOR ?? "#EA562F";

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_TITLE}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_TITLE,
    locale: "es_AR",
    type: "website",
  },
  icons: { icon: "/favicon.ico?=v2", shortcut: "/favicon.ico?=v2" },
};

export const viewport: Viewport = { themeColor: BRAND_COLOR };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="h-full" style={{ "--brand-color": BRAND_COLOR } as React.CSSProperties}>
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable} h-full flex flex-col`}>
        <Suspense fallback={null}>
          <CartProvider>
            <LayoutShell>
              {children}
            </LayoutShell>
          </CartProvider>
        </Suspense>
      </body>
    </html>
  )
}
