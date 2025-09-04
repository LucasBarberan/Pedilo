"use client"

import type React from "react"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { useCart } from "@/components/cart-context"

interface CheckoutFormProps {
  onBack: () => void
  onClose: () => void
}

export function CheckoutForm({ onBack, onClose }: CheckoutFormProps) {
  const { items, getTotalPrice, clearCart } = useCart()
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    deliveryType: "pickup", // pickup or delivery
    address: "",
    paymentMethod: "transfer", // transfer or cash
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate required fields
    if (!formData.firstName || !formData.lastName || !formData.phone) {
      alert("Por favor completa todos los campos obligatorios")
      return
    }

    if (formData.deliveryType === "delivery" && !formData.address) {
      alert("Por favor ingresa la dirección para el delivery")
      return
    }

    // Process order
    const orderSummary = `
¡Pedido confirmado!

Cliente: ${formData.firstName} ${formData.lastName}
Teléfono: ${formData.phone}
Entrega: ${formData.deliveryType === "pickup" ? "Retiro en local" : "Delivery"}
${formData.deliveryType === "delivery" ? `Dirección: ${formData.address}` : ""}
Pago: ${formData.paymentMethod === "transfer" ? "Transferencia" : "Efectivo"}

Total: $${getTotalPrice().toLocaleString()}

¡Gracias por tu pedido!
    `

    alert(orderSummary)
    clearCart()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-background w-full max-h-[90vh] rounded-t-xl overflow-hidden">
        {/* Header */}
        <div className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-primary-foreground hover:bg-primary-foreground/20 p-1"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <h2 className="text-xl font-bold">Datos del Cliente</h2>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* Personal Info */}
            <div className="space-y-4">
              <h3 className="font-bold text-lg">Información Personal</h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firstName">Nombre *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))}
                    placeholder="Tu nombre"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Apellido *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Tu apellido"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="phone">Teléfono *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="Ej: +56 9 1234 5678"
                  required
                />
              </div>
            </div>

            {/* Delivery Type */}
            <div className="space-y-4">
              <h3 className="font-bold text-lg">Tipo de Entrega</h3>
              <RadioGroup
                value={formData.deliveryType}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, deliveryType: value }))}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="pickup" id="pickup" />
                  <Label htmlFor="pickup">Retiro en local</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="delivery" id="delivery" />
                  <Label htmlFor="delivery">Delivery</Label>
                </div>
              </RadioGroup>

              {formData.deliveryType === "delivery" && (
                <div>
                  <Label htmlFor="address">Dirección *</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                    placeholder="Ingresa tu dirección completa"
                    rows={3}
                    required
                  />
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div className="space-y-4">
              <h3 className="font-bold text-lg">Método de Pago</h3>
              <RadioGroup
                value={formData.paymentMethod}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, paymentMethod: value }))}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="transfer" id="transfer" />
                  <Label htmlFor="transfer">Transferencia</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="cash" id="cash" />
                  <Label htmlFor="cash">Efectivo</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Order Summary */}
            <div className="bg-card rounded-xl p-4">
              <h3 className="font-bold text-lg mb-3">Resumen del Pedido</h3>
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.uniqueId} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>
                        {item.name} {item.size && `(${item.size})`} x{item.quantity}
                      </span>
                      <span>${item.finalPrice.toLocaleString()}</span>
                    </div>
                    {item.observation && (
                      <div className="text-xs text-muted-foreground pl-2 border-l-2 border-muted">
                        Obs: {item.observation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="border-t mt-3 pt-3 flex justify-between font-bold">
                <span>Total:</span>
                <span className="text-primary">${getTotalPrice().toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t bg-card p-4">
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3"
            >
              Confirmar Pedido
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
