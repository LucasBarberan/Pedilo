# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## 2.0.0 (2026-08-25)


### Changed

* add sharp library to dependencies and update package-lock.json ([c2ba07a](https://github.com/LucasBarberan/Pedilo/commit/c2ba07ae11fbd5b8ed2808641d44af874f507318))
* dejar de rastrear public/, docker-compose.yml y dockerfile ([156f326](https://github.com/LucasBarberan/Pedilo/commit/156f32616c1ce2b3f9719907e6ece31f66cb5130))
* inital commit con pedilo ([f0100cb](https://github.com/LucasBarberan/Pedilo/commit/f0100cbfd0fba6a3df88b7db94916288817003db))
* sacar tooling de Claude Code del repo y agregar .env.example ([4623c4c](https://github.com/LucasBarberan/Pedilo/commit/4623c4c919f4c11379e837768106c1dbf201a7f9))


### Fixed

* agregar hostname dinámico del backend a remotePatterns de Next.js ([b514493](https://github.com/LucasBarberan/Pedilo/commit/b514493317c33c4aa806b445ce75caeebc8de522))
* ajustar estructura flexbox en página de seguimiento ([10bcade](https://github.com/LucasBarberan/Pedilo/commit/10bcade92ba21b726374426dc7f5d48e4b45a9c3))
* alinear combo_id con product_template_id en checkout-form ([051c701](https://github.com/LucasBarberan/Pedilo/commit/051c7011bcdc249df23da5cac3303e18639c0a61))
* aplicar fixImageUrl en la página del carrito ([7d24487](https://github.com/LucasBarberan/Pedilo/commit/7d244877ae7e79c9341b799705bae2ab21ba53d6))
* Cambio de "Seguimiento" por "Seguí tu pedido acá" ([28388e5](https://github.com/LucasBarberan/Pedilo/commit/28388e5ea155b199ff8748f361ef04809d705f27))
* capitalize combo inclusion titles ([142e10a](https://github.com/LucasBarberan/Pedilo/commit/142e10aba255c819b646e1efed4bee08445c7baa))
* **catalogo:** ajustar tarjeta de producto a 4:3 para que coincida con el recorte ([4c09832](https://github.com/LucasBarberan/Pedilo/commit/4c098321af9f5b3d33dc0c6db9fce17f898f6cc6))
* condición de carrera al preseleccionar modificadores default en combo/producto ([f4580ed](https://github.com/LucasBarberan/Pedilo/commit/f4580ed1284b333ba0a994b46e672cb7a270f32e))
* corregir merge de carrito, etiquetas UI y mensaje de WhatsApp ([da655d1](https://github.com/LucasBarberan/Pedilo/commit/da655d1a49991cd806fc2f341256dbb787a09b43))
* corregir URL del footer para que redirija a https://keltron.app ([e2d66c2](https://github.com/LucasBarberan/Pedilo/commit/e2d66c2f461539037747e01273d839666929b5f8))
* eliminar código de notificaciones del archivo ([d1f3ffb](https://github.com/LucasBarberan/Pedilo/commit/d1f3ffb0b50fcbdeffb17fc032c86d82eba9f56a))
* eliminar dependencia @vercel/analytics de package.json ([4286e9d](https://github.com/LucasBarberan/Pedilo/commit/4286e9db6c2e1b6593e1a84e744765ab44b9d501))
* eliminar líneas blancas alrededor del header y corregir mensaje de cierre ([19d4f1f](https://github.com/LucasBarberan/Pedilo/commit/19d4f1f43d949dabaad22b181a944b227633d7a2))
* eliminar notificaciones push (por ahora) ([5f7014c](https://github.com/LucasBarberan/Pedilo/commit/5f7014c00a1f36598e1bf133749510cb5c14df7c))
* eliminar proxy en tracking y apuntar directo al backend ([3a2274c](https://github.com/LucasBarberan/Pedilo/commit/3a2274c943ef27456d1a7f546b2ba08b51d44b5c))
* envio no cae al fee fijo legado cuando delivery_pricing esta habilitado ([314ee62](https://github.com/LucasBarberan/Pedilo/commit/314ee62ba4057307b835238b9c174dca3e51259b))
* exigir direccion elegida del autocomplete con DELIVERY_PRICING activo ([b7c98f8](https://github.com/LucasBarberan/Pedilo/commit/b7c98f8675200aaf0a9a5b3871298ac6e1b83012))
* forzar selección explícita del método de entrega en checkout ([40b6bd1](https://github.com/LucasBarberan/Pedilo/commit/40b6bd16db539744ac882661671cf9e78ecfb1b4))
* include /public directory in .gitignore for better build management ([5223f7e](https://github.com/LucasBarberan/Pedilo/commit/5223f7e4c765c6cde08515eb17acdb66f04f8530))
* mostrar horario en formato 24h en el banner de cierre ([9bd994c](https://github.com/LucasBarberan/Pedilo/commit/9bd994cba15f9f46d18ef96bed77ad420f21b12d))
* mostrar opciones gratis en el formulario de combo simple ([06a91ee](https://github.com/LucasBarberan/Pedilo/commit/06a91ee994e881505dfb1ab1cb4ccd8c4ec63cc1))
* mover clearCart() después de redirigir a seguimiento ([8c91b06](https://github.com/LucasBarberan/Pedilo/commit/8c91b06d62c3d486c40a1fbdfb836fe9acd6d54e))
* no usar request.url como base de los redirects en /mesa/[token] ([3248034](https://github.com/LucasBarberan/Pedilo/commit/32480341722919d182f44acfb6079f290156c52e))
* ordenar categorías siempre por sortOrder en Pedilo ([f472cbe](https://github.com/LucasBarberan/Pedilo/commit/f472cbe8ee3be897866bbd3ab2a5c07d41f58bf3))
* **pedilo:** corregir 3 bugs en paso de inclusiones del stepper de combo ([66a7ee4](https://github.com/LucasBarberan/Pedilo/commit/66a7ee4a66b9b83218f47b1795a6a400dc1fa872))
* **pedilo:** ocultar sección "Incluye" cuando el combo no tiene extras ([77f0ba6](https://github.com/LucasBarberan/Pedilo/commit/77f0ba69177f272c4d2fcecc8ce614a153ff3b9b))
* **pedilo:** usar vista legacy para combos con 1 solo slot ([9cb540e](https://github.com/LucasBarberan/Pedilo/commit/9cb540e27f9ce7b9b16dc00092bef48674e0f04d))
* quoteCombo/quoteCart mandaban quantity en vez de combo_quantity ([2b8c9bd](https://github.com/LucasBarberan/Pedilo/commit/2b8c9bd0a0061fc89485ca4f23068dc05d74770c))
* respetar sortOrder de categorías en el home ([32b5aec](https://github.com/LucasBarberan/Pedilo/commit/32b5aec0487c5fb157d59b89e915ce79dd1c96e3))
* simplificar footer y posicionarlo correctamente ([2b5e258](https://github.com/LucasBarberan/Pedilo/commit/2b5e2589fd733557b3219208653cb296903b835d))
* support dynamic modifiers in Pedilo combos ([2c48cd0](https://github.com/LucasBarberan/Pedilo/commit/2c48cd0351d0f1c68cbc5b2a4e47c4c33abee792))
* update .gitignore to include docker files and ensure proper formatting ([b095aa4](https://github.com/LucasBarberan/Pedilo/commit/b095aa45b6abe1cba5b0ffff499a4c64cbbceb0f))
* update layout and checkout form for dynamic site metadata and API integration ([8df5406](https://github.com/LucasBarberan/Pedilo/commit/8df5406a721e8362f07daa0a03079c6de213934a))
* update WhatsApp number handling to use dynamic configuration instead of environment variable ([1efe5df](https://github.com/LucasBarberan/Pedilo/commit/1efe5df997d059be06652246237307f4b1109db3))


### Added

* agregar notificaciones push cuando cambia estado del pedido ([c396939](https://github.com/LucasBarberan/Pedilo/commit/c39693967705c7362eecc6905f527204bfb393cf))
* agregar soporte para estado CONFIRMED mapeado a PENDING en seguimiento ([1751356](https://github.com/LucasBarberan/Pedilo/commit/17513568fbe6bb265ca58d06b39be73f966eface))
* banner de promos redirige al combo/producto/categoría asociado ([5633d1a](https://github.com/LucasBarberan/Pedilo/commit/5633d1a417895219932dbfef47b6a512561cc112))
* **cart:** soporte de combos (detalle en carrito/checkout) y addToCart para combos ([aec80b2](https://github.com/LucasBarberan/Pedilo/commit/aec80b261e8b013e7c0c59d6926c2784e3393ccb))
* **catalog:** mostrar opciones gratis en producto suelto y arreglar cantidad por opcion end-to-end ([93252c4](https://github.com/LucasBarberan/Pedilo/commit/93252c45435a97043da51ecb41c778d55f13ec67))
* **checkout:** combos con selección por slots y pedidos programados ([7c08a4b](https://github.com/LucasBarberan/Pedilo/commit/7c08a4b264e0321a13b8a4be461b2fc5d860604c))
* configurar salida como standalone en la configuración de Next.js ([a0946ee](https://github.com/LucasBarberan/Pedilo/commit/a0946ee189fc12c550ce1bde48f5af16e65355f0))
* **delivery:** cotización de envío por distancia y mapa de confirmación ([6ff3d15](https://github.com/LucasBarberan/Pedilo/commit/6ff3d1543ff51ca025bea6bbb83fafb9e478b9d3))
* **delivery:** mostrar costo a coordinar cuando el envio es gratuito/variable ([7c38a11](https://github.com/LucasBarberan/Pedilo/commit/7c38a118a7befc45431f518af8c7a62e009ecf67))
* **delivery:** respetar módulo DELIVERY_PRICING en el checkout ([2c38a66](https://github.com/LucasBarberan/Pedilo/commit/2c38a66de3043cb4ed4166df17db6a175de93fab))
* **front:** imágenes LAN, combos y UX ([f0159b6](https://github.com/LucasBarberan/Pedilo/commit/f0159b62bd30a912562eb9162933b30dd1e8b75f))
* implementar tracking de pedidos en tiempo real con WebSocket ([2714ffb](https://github.com/LucasBarberan/Pedilo/commit/2714ffb69b7270083909459f9317d714dc53d801))
* integra backend (POST /orders), opciones de producto y fixes de precios; UX add-to-cart ([61c3b68](https://github.com/LucasBarberan/Pedilo/commit/61c3b68d88c4d3b4a368ec565083f9d263196892))
* **loyalty:** fidelizacion de puntos en el checkout ([67b461d](https://github.com/LucasBarberan/Pedilo/commit/67b461d66e6f25b41bd5d7fb3a65dacd11ef7f51))
* mejora en cargar pedidos ([78274e6](https://github.com/LucasBarberan/Pedilo/commit/78274e66b71bedc07327b23781a076f82880f8d8))
* **online-config:** migrar configuración de negocio de env vars a API dinámica ([66b7ac5](https://github.com/LucasBarberan/Pedilo/commit/66b7ac5663f014fb77933941bea5c98072ac9dda))
* **order:** delivery_info + payload de combos en /orders + header WA con #de pedido ([bbe4fef](https://github.com/LucasBarberan/Pedilo/commit/bbe4fef3156a2df44526b96d53742c87ec85948c))
* **pedilo:** mejorar UX del stepper de slots en combos ([29b9869](https://github.com/LucasBarberan/Pedilo/commit/29b9869429f8c57eaf8f404fcf9dbc44380f053e))
* **pedilo:** rediseñar paso de inclusiones en stepper de combo ([99c9f9b](https://github.com/LucasBarberan/Pedilo/commit/99c9f9b3b644feb8750b40270d83696203f47e69))
* **producto:** quantity-modifiers — stepper por opción y validación de maxSelections ([70184e9](https://github.com/LucasBarberan/Pedilo/commit/70184e9d9fc3571d0e7390324c9d0e95c2cd3a80))
* **promos:** integrar promos por canal WEB y refactor de combos/productos ([8e733ae](https://github.com/LucasBarberan/Pedilo/commit/8e733ae4e4352776a5f150c95b2f3e4326c01d2b))
* **release:** versionado con standard-version ([810079f](https://github.com/LucasBarberan/Pedilo/commit/810079f2359ff1e9e836ebabdf0dd89e5184ec24))
* **reservations:** pantalla de entrada con reserva de mesa ([50eaf02](https://github.com/LucasBarberan/Pedilo/commit/50eaf024e3f9e72a2cfa726568715bab438a4dda))
* seguimiento de pedido por mesa (pedir cuenta) + validación de capacidad ([d6b54e9](https://github.com/LucasBarberan/Pedilo/commit/d6b54e9a1f927e18041fa5a556bb1cf4ef4605d3))
* soportar extras y múltiples opciones en productos y combos ([6ea3cf5](https://github.com/LucasBarberan/Pedilo/commit/6ea3cf5a102a4b031f55d4a9a963127ea89dac30))
* stepper de combo con modificadores por slot ([0b94189](https://github.com/LucasBarberan/Pedilo/commit/0b941893a6f23da308addf04824cc4644c1d0fd4))
* **test-schema:** modo prueba oculto para checkout en producción ([01f8694](https://github.com/LucasBarberan/Pedilo/commit/01f8694a838d92c0ad457adff444841edf0e9fdf))
* validar teléfono + eliminar item al llegar a 0 + fix deeplink WhatsApp ([a94e1b3](https://github.com/LucasBarberan/Pedilo/commit/a94e1b3e7db511126aa52169804330d9b4bfa338))
* **wholesale:** modo mayorista en catálogo y checkout (STORE_MODE) ([a283c88](https://github.com/LucasBarberan/Pedilo/commit/a283c8854df5f009c2c1b6d62f2b39337ba5ee63))

# Changelog

Todas las versiones notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).
