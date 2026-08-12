<?php

use App\Http\Controllers\Api\Auth\AuthController;
use App\Http\Controllers\Api\HmoProviderController;
use Illuminate\Support\Facades\Route;

// Public — the registration wizard's HMO dropdown needs this before the
// patient has an account, so it sits outside the auth:sanctum group.
Route::get('/hmo-providers', [HmoProviderController::class, 'index']);

// Public — live email-uniqueness check for the registration wizard.
Route::get('/check-email', [AuthController::class, 'checkEmail']);

Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);

    Route::middleware('throttle:10,1')->group(function () {
        Route::post('/verify-otp', [AuthController::class, 'verifyOtp']);
        Route::post('/resend-otp', [AuthController::class, 'resendOtp']);
        Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
        Route::post('/verify-reset-otp', [AuthController::class, 'verifyResetOtp']);
        Route::post('/reset-password', [AuthController::class, 'resetPassword']);
    });

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);

        // TEMPORARY — for testing role middleware only
        Route::get('/admin-only-test', function () {
            return response()->json(['message' => 'You are an admin!']);
        })->middleware('role:admin');
    });
});