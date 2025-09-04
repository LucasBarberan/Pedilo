export interface Product {
  id: number
  name: string
  description: string
  price: number
  image: string
  category: string
}

export const productData: Record<string, Product[]> = {
  "hamburguesas-completas": [
    {
      id: 1,
      name: "CHEESEBURGER CON PAPAS",
      description: "Pan de papa, un medallón de carne, doble feta de queso cheddar, mayonesa, ketchup y cebolla",
      price: 9900,
      image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-mUqokKAsVDRCX5KBIjyh6KVgyvfFeq.png",
      category: "hamburguesas-completas",
    },
    {
      id: 2,
      name: "DOBLE CUARTO DE LIBRA CON PAPAS",
      description: "Doble medallón de carne, queso cheddar, lechuga, tomate, cebolla y salsa especial",
      price: 12800,
      image: "/double-quarter-pounder-burger-with-fries.png",
      category: "hamburguesas-completas",
    },
    {
      id: 3,
      name: "ROYAL CON PAPAS",
      description: "Medallón de carne premium, queso suizo, bacon, lechuga y salsa royal",
      price: 12800,
      image: "/royal-burger-with-bacon-and-fries.png",
      category: "hamburguesas-completas",
    },
  ],
  "hamburguesas-sin-papas": [
    {
      id: 4,
      name: "CHEESEBURGER SIMPLE",
      description: "Pan de papa, medallón de carne, queso cheddar, mayonesa, ketchup y cebolla",
      price: 7500,
      image: "/simple-cheeseburger-without-fries.png",
      category: "hamburguesas-sin-papas",
    },
    {
      id: 5,
      name: "HAMBURGUESA DOBLE",
      description: "Pan de papa, doble medallón de carne, queso cheddar, lechuga, tomate",
      price: 9200,
      image: "/double-hamburger-without-fries.png",
      category: "hamburguesas-sin-papas",
    },
  ],
  bebidas: [
    {
      id: 6,
      name: "COCA COLA 500ML",
      description: "Bebida gaseosa Coca Cola 500ml",
      price: 2500,
      image: "/coca-cola-bottle-500ml.png",
      category: "bebidas",
    },
    {
      id: 7,
      name: "AGUA MINERAL",
      description: "Agua mineral sin gas 500ml",
      price: 1800,
      image: "/mineral-water-bottle.png",
      category: "bebidas",
    },
  ],
  extras: [
    {
      id: 8,
      name: "PAPAS FRITAS GRANDES",
      description: "Porción grande de papas fritas crujientes",
      price: 3500,
      image: "/large-french-fries-portion.png",
      category: "extras",
    },
    {
      id: 9,
      name: "AROS DE CEBOLLA",
      description: "Aros de cebolla empanados y fritos",
      price: 4200,
      image: "/onion-rings-fried.png",
      category: "extras",
    },
  ],
}

export function getProductsByCategory(categoryId: string): Product[] {
  return productData[categoryId] || []
}

export function getProductById(id: number): Product | null {
  for (const categoryProducts of Object.values(productData)) {
    const product = categoryProducts.find((p) => p.id === id)
    if (product) return product
  }
  return null
}

export function getCategoryTitle(categoryId: string): string {
  switch (categoryId) {
    case "hamburguesas-completas":
      return "COMBO HAMBURGUESAS CON PAPAS"
    case "hamburguesas-sin-papas":
      return "HAMBURGUESAS SIN PAPAS"
    case "bebidas":
      return "BEBIDAS"
    case "extras":
      return "EXTRAS"
    default:
      return "PRODUCTOS"
  }
}
