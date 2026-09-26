#!/bin/sh
set -e

php artisan migrate --force

# --force lets this re-run safely even though the symlink already exists
# from a previous container — public/ is rebuilt fresh on every deploy, so
# there's nothing to skip.
php artisan storage:link --force || echo "storage:link failed — continuing without it."

php artisan config:cache
php artisan route:cache
php artisan view:cache

# firstOrCreate/insertOrIgnore-based — safe to run on every deploy, not
# just the first one. A role with no SEED_*_PASSWORD set is skipped (see
# ProductionSeeder), not fatal, so a missing var never blocks the app from
# starting.
php artisan db:seed --class=ProductionSeeder --force || echo "ProductionSeeder reported an error — continuing so the app still starts."

# Railway only decides $PORT at container start, not at build time, so
# Apache's own config (fixed at port 80) needs rewriting here before it
# starts. ports.conf just has "Listen 80"; the vhost has "<VirtualHost
# *:80>" — both simple enough that a plain substitution is safe.
sed -ri "s/:80/:${PORT:-8080}/g; s/^Listen 80/Listen ${PORT:-8080}/" \
    /etc/apache2/ports.conf /etc/apache2/sites-available/000-default.conf

exec apache2-foreground
