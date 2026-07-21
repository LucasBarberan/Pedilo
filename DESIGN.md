---
name: Pedilo
description: Sistema visual mobile-first para pedidos gastronomicos online con identidad configurable por comercio.
colors:
  brand-runtime: "#EA562F"
  background-warm: "oklch(0.98 0.01 45)"
  foreground-ink: "oklch(0.2 0 0)"
  card-white: "oklch(1 0 0)"
  primary-action: "oklch(0.65 0.2 35)"
  secondary-highlight: "oklch(0.8 0.15 85)"
  muted-surface: "oklch(0.96 0.01 45)"
  muted-text: "oklch(0.5 0 0)"
  border-warm: "oklch(0.9 0.01 45)"
  destructive: "oklch(0.577 0.245 27.325)"
typography:
  display:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "normal"
  headline:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.25
  title:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 800
    lineHeight: 1.3
  body:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.25
rounded:
  md: "0.5rem"
  lg: "0.75rem"
  xl: "1rem"
  full: "9999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary-action}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-large:
    backgroundColor: "{colors.primary-action}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1.5rem"
    height: "2.5rem"
  card-product:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.foreground-ink}"
    rounded: "{rounded.xl}"
    padding: "1rem"
  input-default:
    backgroundColor: "transparent"
    textColor: "{colors.foreground-ink}"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.75rem"
    height: "2.25rem"
---

# Design System: Pedilo

## 1. Overview

**Creative North Star: "Mostrador Digital"**

Pedilo debe sentirse como pedir en un mostrador bien atendido desde el celular: directo, confiable y sin ruido. La marca del comercio aparece primero en el header, el logo y el color configurable; la estructura del producto permanece consistente para que categorias, carrito, checkout y seguimiento sean faciles de entender en cualquier negocio gastronomico.

La personalidad visual es tactil y sobria. Usa superficies claras, bordes redondeados, sombras suaves y acentos de marca solo donde ayudan a decidir: header, precio, foco, CTA y estados importantes. El sistema rechaza la app de delivery saturada, la plantilla generica y el checkout burocratico.

**Key Characteristics:**
- Mobile-first, con areas tocables grandes y jerarquia compacta.
- Identidad configurable por comercio sin romper patrones de compra.
- Superficies blancas sobre fondo calido, con acento de marca controlado.
- Tipografia unica, fuerte y legible para nombres, precios y acciones.
- Estados visibles para carga, cerrado, promociones, errores y seguimiento.

## 2. Colors

La paleta es una base neutral calida con color de marca intercambiable; el diseno debe funcionar aunque el primario cambie por configuracion.

### Primary
- **Acento de Marca Runtime**: color inyectado desde `NEXT_PUBLIC_BRAND_COLOR` y expuesto como `--brand-color`. Se usa para header, precios, dots de carga y momentos de identidad del comercio.
- **Primary Action**: token de accion principal para componentes shadcn. Su rol es CTA, foco y seleccion; no debe convertirse en decoracion de fondo.

### Secondary
- **Highlight Gastronomico**: token amarillo del sistema para realces secundarios. Debe usarse con moderacion y solo cuando aporte estado o contraste funcional.

### Neutral
- **Fondo Calido de App**: superficie base para la experiencia de carta y checkout. Mantiene cercania sin competir con imagenes de producto.
- **Tinta Principal**: texto principal de alta lectura para nombres, totales y controles.
- **Blanco de Tarjeta**: contenedor base para categorias, productos, formularios y estados.
- **Texto Muted**: descripcion, ayuda y metadata; no debe usarse para informacion critica como precio, error o CTA.
- **Borde Calido**: separadores, inputs y banners con presencia baja.

### Named Rules
**The Runtime Brand Rule.** El color de marca es variable por comercio; los layouts, radios, jerarquias y estados deben seguir funcionando aunque el hue cambie.

**The Ten Percent Accent Rule.** En una pantalla de tarea, el acento debe guiar acciones y precios, no banar toda la interfaz.

## 3. Typography

**Display Font:** Geist Sans (with system-ui fallback)
**Body Font:** Geist Sans (with system-ui fallback)
**Label/Mono Font:** Geist Mono para casos tecnicos o datos si aparece; no es la voz principal.

**Character:** Una sola familia sostiene el producto. La personalidad viene de peso, mayusculas controladas y densidad, no de cambios de fuente.

### Hierarchy
- **Display** (800, 1.5rem, 1.2): titulos de categoria y pantallas principales. Puede usar uppercase cuando el texto sea corto.
- **Headline** (800, 1.25rem, 1.25): estados de seguimiento, titulos de formularios y bloques importantes.
- **Title** (800, 1rem, 1.3): nombres de productos, categorias y opciones.
- **Body** (400, 0.875rem, 1.5): descripciones, ayuda y texto de soporte. Mantener parrafos por debajo de 65-75ch.
- **Label** (500, 0.875rem, 1.25): botones, campos, chips y controles.

### Named Rules
**The Price Speaks Rule.** Los precios usan peso alto y color de marca; nunca deben quedar en muted text ni competir con textos promocionales secundarios.

## 4. Elevation

El sistema usa elevacion tactil y sobria: sombras suaves para distinguir superficies clickeables y overlays, bordes finos para estructura, y no mas profundidad de la necesaria. Las tarjetas descansan con `shadow-sm`; en hover pueden subir a `shadow-md`. El loader bloqueante es la excepcion de mayor elevacion porque interrumpe la tarea.

### Shadow Vocabulary
- **Resting Surface** (`shadow-sm`): tarjetas de categoria, producto, tracking y componentes shadcn.
- **Interactive Lift** (`hover:shadow-md`): tarjetas clickeables de categoria/producto al hover o foco.
- **Blocking Overlay** (`shadow-xl` sobre backdrop `bg-black/35 backdrop-blur-[2px]`): solo para carga bloqueante o estados que impiden continuar.

### Named Rules
**The Soft Lift Rule.** Si una sombra se nota antes que el producto, es demasiado fuerte. La elevacion confirma interaccion, no decora.

## 5. Components

### Buttons
- **Shape:** redondeo medio consistente (`0.5rem`) para botones shadcn; botones circulares solo para iconos de header y carrito.
- **Primary:** fondo de accion principal, texto blanco, altura compacta (`2.25rem`) o grande (`2.5rem`) segun contexto.
- **Hover / Focus:** hover por opacidad o leve cambio de fondo; foco visible con ring de marca (`ring-[3px]`) y borde de foco.
- **Secondary / Ghost:** reservar para acciones no dominantes; no competir con agregar al carrito, continuar o confirmar pedido.

### Chips
- **Style:** chips o badges promocionales pequenos, con fondo semantico y texto blanco cuando estan sobre imagen.
- **State:** solo mostrar si hay informacion real: promo, estado, seleccionado o alerta. No llenar la carta de etiquetas decorativas.

### Cards / Containers
- **Corner Style:** redondeos generosos (`1rem`) en tarjetas comerciales y `0.75rem` en superficies base.
- **Background:** blanco o blanco translúcido; no introducir vidrio decorativo. Las tarjetas de categoria usan imagen centrada y nombre fuerte; las de producto usan imagen, nombre, descripcion breve y precio.
- **Shadow Strategy:** `shadow-sm` en reposo, `shadow-md` en hover cuando la tarjeta navega o agrega valor tactil.
- **Border:** ring/borde negro con baja opacidad (`ring-black/5`) para separar del fondo calido.
- **Internal Padding:** `1rem` como base, subiendo a `1.5rem` en formularios o estados importantes.

### Inputs / Fields
- **Style:** fondo transparente o blanco, borde `border-input`, radio medio (`0.5rem`), altura `2.25rem` y padding horizontal `0.75rem`.
- **Focus:** ring visible de marca; no depender solo de cambio de color de borde.
- **Error / Disabled:** error con destructive border/ring; disabled con opacidad reducida y cursor bloqueado.

### Navigation
- **Style, typography, default/hover/active states, mobile treatment.** Header fijo en altura (`72px`) con fondo de marca runtime, logo centrado, boton volver a la izquierda y carrito a la derecha. En mobile, la navegacion debe priorizar volver, carrito y reconocimiento de marca sin agregar menus innecesarios.

### Status Banners
Estados de cerrado, solo local, info, warning y success se muestran como contenedores redondeados (`1rem`) con borde y fondo semantico suave. Deben aparecer cerca del inicio de la pantalla y explicar la consecuencia operativa, no solo mostrar un color.

### Blocking Loader
Overlay de interrupcion con backdrop oscuro translucido, tarjeta blanca semitransparente, logo y dots de marca. Solo se usa cuando la app realmente no puede continuar; para carga inline, preferir skeleton o contenido progresivo.

## 6. Do's and Don'ts

### Do:
- **Do** mantener la experiencia mobile-first: botones tocables, textos legibles y decisiones visibles sin hacer zoom.
- **Do** usar `--brand-color` para identidad del comercio y tokens de sistema para estructura reusable.
- **Do** hacer que precio, CTA y estado sean los elementos mas faciles de encontrar en cada pantalla.
- **Do** sostener la elevacion tactil y sobria: tarjetas claras, sombras suaves y foco visible.
- **Do** escribir errores y estados como instrucciones utiles, especialmente en checkout y seguimiento.

### Don't:
- **Don't** parecer una app masiva de delivery saturada, impersonal o dominada por promociones.
- **Don't** convertir la app en una plantilla generica donde todos los comercios se ven iguales.
- **Don't** hacer un checkout burocratico con pasos innecesarios, precios ambiguos o validaciones confusas.
- **Don't** usar el color de marca como decoracion indiscriminada; debe guiar decisiones.
- **Don't** introducir side-stripe borders, gradient text, glassmorphism decorativo, metric heroes o grids de tarjetas identicas sin jerarquia.
