"use client"

import { ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/components/cart-context"

interface CategoryMenuProps {
  onCategorySelect: (category: string) => void
  onCartClick: () => void
}

export function CategoryMenu({ onCategorySelect, onCartClick }: CategoryMenuProps) {
  const { getTotalItems } = useCart()

  const categories = [
    {
      id: "hamburguesas-completas",
      name: "HAMBURGUESAS CON PAPAS",
      image: "/rewards/free-burger.png",
    },
    {
      id: "hamburguesas-sin-papas",
      name: "HAMBURGUESAS SIN PAPAS",
      image: "/gourmet-burger-without-fries.png",
    },
    {
      id: "bebidas",
      name: "BEBIDAS",
      image: "/refreshing-drinks-and-sodas.png",
    },
    {
      id: "extras",
      name: "EXTRAS",
      image: "/burger-extras-and-sides.png",
    },
  ]

  return (
    <div className="relative">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Categorías</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCartClick}
          className="relative text-primary-foreground hover:bg-primary-foreground/20"
        >
          <ShoppingCart className="h-6 w-6" />
          {getTotalItems() > 0 && (
            <span className="absolute -top-2 -right-2 bg-accent text-accent-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
              {getTotalItems()}
            </span>
          )}
        </Button>
      </div>

      {/* Categories Grid */}
      <div className="p-4 space-y-4">
        {categories.map((category) => (
          <div
            key={category.id}
            onClick={() => onCategorySelect(category.id)}
            className="relative overflow-hidden rounded-xl cursor-pointer transform transition-transform active:scale-95"
          >
            <img src={category.image || "/placeholder.svg"} alt={category.name} className="w-full h-32 object-cover" />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <h2 className="text-white text-lg font-bold text-center px-4">{category.name}</h2>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
