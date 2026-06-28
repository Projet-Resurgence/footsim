# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite static-replaces import.meta.env.VITE_* at build time — pass them as ARGs
ARG VITE_DISCORD_CLIENT_ID
ARG VITE_DISCORD_REDIRECT_URI
ARG VITE_ADMIN_DISCORD_ID
ARG VITE_PR_API_URL

ENV VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID \
    VITE_DISCORD_REDIRECT_URI=$VITE_DISCORD_REDIRECT_URI \
    VITE_ADMIN_DISCORD_ID=$VITE_ADMIN_DISCORD_ID \
    VITE_PR_API_URL=$VITE_PR_API_URL

RUN npm run build

# ── Serve stage ───────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA fallback: all paths → index.html
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' \
    > /etc/nginx/conf.d/default.conf

EXPOSE 80
