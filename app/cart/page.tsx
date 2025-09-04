"use client"

import { Cart } from "@/components/cart"
import { useRouter } from "next/navigation"

export default function CartPage() {
  const router = useRouter()

  const handleClose = () => {
    router.back()
  }

  return (
    <div className="min-h-screen bg-background">
      <Cart onClose={handleClose} />
    </div>
  )
}
