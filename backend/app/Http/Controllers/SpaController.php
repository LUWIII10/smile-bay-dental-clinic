<?php

namespace App\Http\Controllers;

class SpaController extends Controller
{
    // Serves the built React app's index.html for "/" — the Docker image
    // copies frontend/dist/ into public/, so this file only exists in that
    // production image. Locally (php artisan serve, no build copied in)
    // there's nothing to serve, so this falls back to the original welcome
    // view — same response local dev always had.
    public function index()
    {
        $indexPath = public_path('index.html');

        if (file_exists($indexPath)) {
            return response()->file($indexPath);
        }

        return view('welcome');
    }

    // Catch-all for React Router deep links (e.g. /patient/dashboard) so a
    // hard refresh doesn't 404 — every non-api/sanctum/storage path falls
    // through to here and gets the same SPA shell; React Router then reads
    // the URL client-side. Without a build present, this 404s exactly like
    // an unmatched route always did before this route existed (no behavior
    // change for local dev, where nothing hits this path anyway).
    public function fallback()
    {
        $indexPath = public_path('index.html');

        if (file_exists($indexPath)) {
            return response()->file($indexPath);
        }

        abort(404);
    }

    public function unauthenticated()
    {
        return response()->json(['message' => 'Unauthenticated.'], 401);
    }
}
