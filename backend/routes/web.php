<?php

use App\Http\Controllers\SpaController;
use Illuminate\Support\Facades\Route;

Route::get('/', [SpaController::class, 'index']);

Route::get('/login', [SpaController::class, 'unauthenticated'])->name('login');

// Must stay last: matches anything not already claimed above (and not
// api/, sanctum/, or storage/, which belong to routes/api.php, Sanctum's
// own package routes, and the storage symlink respectively) so a React
// Router deep link still resolves on a hard refresh in production. Moved
// off closures (this one included) onto SpaController methods because
// `php artisan route:cache` refuses to cache closure-based routes.
Route::get('/{any}', [SpaController::class, 'fallback'])
    ->where('any', '^(?!api|sanctum|storage).*$');
