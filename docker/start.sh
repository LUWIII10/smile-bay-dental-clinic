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

exec php artisan serve --host=0.0.0.0 --port="${PORT:-8080}"
