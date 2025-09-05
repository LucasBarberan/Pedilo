// app/checkout/page.tsx
"use client";

import CheckoutForm from "@/components/checkout-form";
import SiteHeader from "@/components/site-header";
import { useRouter } from "next/navigation";

export default function CheckoutPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader showBack onBack={() => router.back()} />
      <div className="h-[6px] w-full bg-white" />

      <div className="mx-auto w-full max-w-5xl p-4">
        <CheckoutForm
          onCancel={() => router.back()}
          onSuccess={() => router.push("/")} // o a una pantalla de "gracias"
        />
      </div>
    </div>
  );
}
