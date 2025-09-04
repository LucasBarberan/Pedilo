"use client"

import { ProductList } from "@/components/product-list"
import { useRouter, useParams } from "next/navigation"

export default function CategoryPage() {
  const router = useRouter()
  const params = useParams()
  const category = decodeURIComponent(params.slug as string)

  const handleProductSelect = (product: any) => {
    router.push(`/product/${product.id}`)
  }

  const handleBack = () => {
    router.push("/")
  }

  const handleCartClick = () => {
    router.push("/cart")
  }

  return (
    <div className="min-h-screen bg-background">
      <ProductList
        category={category}
        onProductSelect={handleProductSelect}
        onBack={handleBack}
        onCartClick={handleCartClick}
      />
    </div>
  )
}
