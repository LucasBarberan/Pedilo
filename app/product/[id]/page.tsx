"use client"

import { ProductDetail } from "@/components/product-detail"
import { useRouter, useParams } from "next/navigation"
import { useState, useEffect } from "react"
import { getProductById, type Product } from "@/lib/products"

export default function ProductPage() {
  const router = useRouter()
  const params = useParams()
  const productId = Number.parseInt(params.id as string)
  const [product, setProduct] = useState<Product | null>(null)

  useEffect(() => {
    const foundProduct = getProductById(productId)
    setProduct(foundProduct)
  }, [productId])

  const handleBack = () => {
    router.back()
  }

  const handleCartClick = () => {
    router.push("/cart")
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Producto no encontrado</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <ProductDetail product={product} onBack={handleBack} onCartClick={handleCartClick} />
    </div>
  )
}
