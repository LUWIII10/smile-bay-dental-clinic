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
# Apache, not `php artisan serve` — Railway's first real deploy proved the
# built-in dev server crash-loops ("Invalid URI" from Symfony's Request::
# create(), vendor/symfony/http-foundation/Request.php:355) against
# Railway's proxy traffic. PHP's own docs call that server dev-only; Apache
# is the standard, battle-tested way to serve Laravel in a container.
FROM php:8.3-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
        unzip \
        git \
        libzip-dev \
        libonig-dev \
    && docker-php-ext-install pdo_mysql mbstring zip bcmath \
    && a2enmod rewrite \
    # apt's own apache2 postinst re-enabled mpm_event alongside the base
    # image's mpm_prefork (mod_php needs prefork specifically, it isn't
    # thread-safe) — "More than one MPM loaded" is Apache refusing to start
    # with both active. (|| true) only covers "mpm_event wasn't enabled to
    # begin with" — a real failure anywhere else in this chain still fails
    # the build.
    && (a2dismod mpm_event mpm_worker || true) \
    && a2enmod mpm_prefork \
    && rm -rf /var/lib/apt/lists/*

# Laravel's public/ is the real document root, not Apache's default
# /var/www/html — the standard sed from Docker's own php-apache image docs
# for repointing it, plus AllowOverride so Laravel's public/.htaccess can
# rewrite everything (including /api/*) through index.php.
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
    && sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf \
    && { \
        echo '<Directory ${APACHE_DOCUMENT_ROOT}>'; \
        echo '  AllowOverride All'; \
        echo '</Directory>'; \
    } >> /etc/apache2/apache2.conf

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html
COPY backend/ .
COPY --from=frontend-build /app/frontend/dist/ ./public/

RUN composer install --no-dev --optimize-autoloader --no-interaction

# Apache's worker processes run as www-data, not the root user this build
# runs as — without this, Laravel can't write storage/logs, the framework
# cache dirs, or bootstrap/cache (config:cache's own output).
RUN chown -R www-data:www-data storage bootstrap/cache

COPY docker/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh /var/www/html/artisan

EXPOSE 8080
CMD ["/usr/local/bin/start.sh"]
