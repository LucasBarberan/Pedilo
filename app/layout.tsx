import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { CartProvider } from "@/components/cart-context"
import { Suspense } from "react"
import "./globals.css"
import type { Viewport } from "next";

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME ?? 'NombreEmpresa';
const SITE_TITLE = `Keltron GO - ${STORE_NAME}`;
const BRAND_COLOR = process.env.NEXT_PUBLIC_BRAND_COLOR ?? "#EA562F";

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_TITLE}`,
  },
  icons: { icon: "/favicon.ico?=v2", shortcut: "/favicon.ico?=v2" },
  // opcional, para que la barra del navegador tome el color
  
  
};

export const viewport: Viewport = { themeColor: BRAND_COLOR };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en"
    // definimos la variable CSS accesible en toda la app
      style={{ ["--brand-color" as any]: BRAND_COLOR }}>
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <Suspense fallback={null}>
          <CartProvider>{children}</CartProvider>
        </Suspense>
        <Analytics />
      </body>
    </html>
  )
}
