# ===== deps =====
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# IMPORTANTE: sharp debe estar en "dependencies" del package.json
RUN npm ci --legacy-peer-deps

# ===== build =====
FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# --- ARGs pÃºblicos al build ---
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_APP_URL

ARG NEXT_PUBLIC_WA_NUMBER
ARG NEXT_PUBLIC_STORE_NAME
ARG NEXT_PUBLIC_BRAND_COLOR
ARG NEXT_PUBLIC_STORE_DESCRIPTION



# âš ï¸ Sin espacios en ENV (sino quedan mal definidas)
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_WA_NUMBER=$NEXT_PUBLIC_WA_NUMBER
ENV NEXT_PUBLIC_STORE_NAME=$NEXT_PUBLIC_STORE_NAME
ENV NEXT_PUBLIC_BRAND_COLOR=$NEXT_PUBLIC_BRAND_COLOR
ENV NEXT_PUBLIC_STORE_DESCRIPTION=$NEXT_PUBLIC_STORE_DESCRIPTION
RUN npm run build

# ===== run =====
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Recomendado para sharp en Alpine (musl)
RUN apk add --no-cache libc6-compat

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# Crear cachÃ© de imÃ¡genes y dar permisos al usuario que ejecuta Node
RUN mkdir -p .next/cache/images && chown -R node:node /app/.next

USER node

EXPOSE 3000
CMD ["node", "server.js"]
