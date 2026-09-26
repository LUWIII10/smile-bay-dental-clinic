#!/bin/sh
set -e

php artisan migrate --force

# Railway Volume mounted at storage/app/public starts empty (or, after this
# runs once, holds whatever real files got uploaded since) — restore the
# real files baked into the image (dentist avatars, etc.) that the volume's
# own empty filesystem otherwise hides. -n (no-clobber) never overwrites a
# file that's already there, so a real user's upload always wins over the
# seed copy; this only ever fills in what's missing.
mkdir -p storage/app/public/avatars storage/app/public/hmo-logos
cp -rn /var/www/seed-public-disk/. storage/app/public/ 2>/dev/null || true
chown -R www-data:www-data storage/app/public

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

# Build-time logs already confirmed only mpm_prefork was enabled in the
# image, yet Apache still refused to start with "More than one MPM loaded"
# — re-asserting it here (and printing what's actually active) removes any
# doubt about whether something changes between build and this exact
# moment, whatever the reason turns out to be.
(a2dismod mpm_event mpm_worker || true) >/dev/null 2>&1
a2enmod mpm_prefork >/dev/null 2>&1 || true
echo "Enabled MPM module(s):"
apache2ctl -M 2>&1 | grep -i mpm || echo "(apache2ctl -M produced no mpm output)"

exec apache2-foreground
