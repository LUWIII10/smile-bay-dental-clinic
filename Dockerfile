# Single Railway service: Laravel serves both the API and the built React
# app (same origin — see routes/web.php's SpaController). Two stages so the
# final image only carries Node's build OUTPUT, not Node itself or
# frontend/node_modules.

# ---- Stage 1: build the React frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ---- Stage 2: PHP application (serves API + the frontend build) ----
FROM php:8.3-cli

RUN apt-get update && apt-get install -y --no-install-recommends \
        unzip \
        git \
        libzip-dev \
    && docker-php-ext-install pdo_mysql mbstring zip bcmath \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
COPY backend/ .
COPY --from=frontend-build /app/frontend/dist/ ./public/

RUN composer install --no-dev --optimize-autoloader --no-interaction

COPY docker/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh /app/artisan

EXPOSE 8080
CMD ["/usr/local/bin/start.sh"]
