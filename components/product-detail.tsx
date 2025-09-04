"use client"

import { useState } from "react"
import { ArrowLeft, ShoppingCart, Plus, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useCart } from "@/components/cart-context"

interface ProductDetailProps {
  product: any
  onBack: () => void
  onCartClick: () => void
}

export function ProductDetail({ product, onBack, onCartClick }: ProductDetailProps) {
  const { addToCart, getTotalItems } = useCart()
  const [quantity, setQuantity] = useState(1)
  const [size, setSize] = useState<"simple" | "doble" | "triple">("simple")
  const [observations, setObservations] = useState("")

  const isHamburger = product.category === "hamburguesas-completas" || product.category === "hamburguesas-sin-papas"

  const getSizePrice = () => {
    const basePrice = product.price
    switch (size) {
      case "doble":
        return basePrice + 3000
      case "triple":
        return basePrice + 5500
      default:
        return basePrice
    }
  }

  const handleAddToCart = () => {
    const item = {
      ...product,
      quantity,
      size: isHamburger ? size : undefined,
      observations,
      finalPrice: getSizePrice() * quantity,
      uniqueId: `${product.id}-${size}-${Date.now()}`,
    }
    addToCart(item)

    // Reset form
    setQuantity(1)
    setSize("simple")
    setObservations("")

    // Show success feedback
    alert("¡Producto agregado al carrito!")
  }

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
          <h1 className="text-lg font-bold">{product.name}</h1>
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

      {/* Product Image */}
      <div className="p-4">
        <img
          src={product.image || "/placeholder.svg"}
          alt={product.name}
          className="w-full h-64 object-cover rounded-xl"
        />
      </div>

      {/* Product Info */}
      <div className="px-4 pb-4">
        <p className="text-muted-foreground text-sm mb-4">{product.description}</p>

        {/* Size Selection for Hamburgers */}
        {isHamburger && (
          <div className="mb-6">
            <h3 className="font-bold mb-3">Tamaño:</h3>
            <div className="space-y-2">
              {[
                { value: "simple", label: "Simple", extra: 0 },
                { value: "doble", label: "Doble", extra: 3000 },
                { value: "triple", label: "Triple", extra: 5500 },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSize(option.value as any)}
                  className={`w-full p-3 rounded-lg border-2 text-left transition-colors ${
                    size === option.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-card-foreground"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-sm">{option.extra > 0 && `+$${option.extra.toLocaleString()}`}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quantity */}
        <div className="mb-6">
          <h3 className="font-bold mb-3">Cantidad:</h3>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-xl font-bold w-8 text-center">{quantity}</span>
            <Button variant="outline" size="sm" onClick={() => setQuantity(quantity + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Observations */}
        <div className="mb-6">
          <h3 className="font-bold mb-3">Observaciones:</h3>
          <Textarea
            placeholder="Escribe aquí cualquier observación especial para tu pedido..."
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            className="min-h-20"
          />
        </div>

        {/* Price and Add to Cart */}
        <div className="bg-card rounded-xl p-4 mb-4">
          <div className="flex justify-between items-center mb-4">
            <span className="text-lg font-bold">Total:</span>
            <span className="text-2xl font-bold text-primary">${(getSizePrice() * quantity).toLocaleString()}</span>
          </div>
          <Button
            onClick={handleAddToCart}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3"
          >
            Agregar al Carrito
          </Button>
        </div>
      </div>
    </div>
  )
}
