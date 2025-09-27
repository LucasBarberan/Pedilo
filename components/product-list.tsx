"use client"

import { ArrowLeft, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/components/cart-context"
import { getProductsByCategory, getCategoryTitle } from "@/lib/products"

interface ProductListProps {
  category: string
  onProductSelect: (product: any) => void
  onBack: () => void
  onCartClick: () => void
}

function prewarmProduct(p: any) {
  try {
    sessionStorage.setItem(
      `prefetch:product:${p.id}`,
      JSON.stringify({
        id: p.id,
        name: p.name,
        imageUrl: p.image ?? p.imageUrl ?? "",
        price: p.price ?? 0,
        description: p.description ?? "",
        category: p.category ?? "",
        productOptions: p.productOptions ?? [],
      })
    );
  } catch {}

  // Precarga de imagen para que el swap sea instantáneo
  const src = p.image ?? p.imageUrl;
  if (src) {
    const img = new Image();
    img.src = src;
  }
}



export function ProductList({ category, onProductSelect, onBack, onCartClick }: ProductListProps) {
  const { getTotalItems } = useCart()

  const products = getProductsByCategory(category)
  const categoryTitle = getCategoryTitle(category)

  return (
    <div className="relative">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-primary-foreground hover:bg-primary-foreground/20 p-1"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-lg font-bold">{categoryTitle}</h1>
        </div>
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

      {/* Products List */}
      <div className="p-4 space-y-4">
        {products.map((product) => (
          <div
            key={product.id}
            onMouseEnter={() => prewarmProduct(product)}
            onClick={() => {
              prewarmProduct(product);
              onProductSelect(product);
            }}
            className="bg-card rounded-xl p-4 flex gap-4 cursor-pointer transform transition-transform active:scale-95 shadow-sm"
          >
            <img
              src={product.image || "/placeholder.svg"}
              alt={product.name}
              className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
            />
            <div className="flex-1">
              <h3 className="font-bold text-card-foreground text-sm mb-1">{product.name}</h3>
              <p className="text-muted-foreground text-xs mb-2 line-clamp-2">{product.description}</p>
              <p className="text-primary font-bold text-lg">${product.price.toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
