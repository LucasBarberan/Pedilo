"use client"

import { CategoryMenu } from "@/components/category-menu"
import { useRouter } from "next/navigation"

export default function Home() {
  const router = useRouter()

  const handleCategorySelect = (category: string) => {
    router.push(`/category/${encodeURIComponent(category)}`)
  }

  const handleCartClick = () => {
    router.push("/cart")
  }

  return (
    <div className="min-h-screen bg-background">
      <CategoryMenu onCategorySelect={handleCategorySelect} onCartClick={handleCartClick} />
    </div>
  )
}
