<?php

use App\Http\Controllers\SpaController;
use Illuminate\Support\Facades\Route;

Route::get('/', [SpaController::class, 'index']);

// Not a real page — Laravel's own 'auth' middleware redirects here BY NAME
// (route('login')) when a web-guarded request is unauthenticated. Used to
// live at the URL /login itself, which was harmless when the frontend was
// a separate origin, but now that this same Laravel app also serves the
// built React SPA (same origin, see the catch-all below), that collided
// with React Router's OWN /login page — Laravel's route matched first on
// every hard refresh/direct visit, so the browser got this raw JSON
// instead of the actual login screen. Keeping the NAME so Laravel's
// internal redirect still resolves correctly, moving the PATH somewhere
// no one — frontend code included — ever navigates to directly.
Route::get('/_internal/unauthenticated', [SpaController::class, 'unauthenticated'])->name('login');

// Must stay last: matches anything not already claimed above (and not
// api/, sanctum/, or storage/, which belong to routes/api.php, Sanctum's
// own package routes, and the storage symlink respectively) so a React
// Router deep link still resolves on a hard refresh in production. Moved
// off closures (this one included) onto SpaController methods because
// `php artisan route:cache` refuses to cache closure-based routes.
Route::get('/{any}', [SpaController::class, 'fallback'])
    ->where('any', '^(?!api|sanctum|storage).*$');
