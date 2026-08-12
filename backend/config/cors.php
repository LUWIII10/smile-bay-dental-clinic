<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    // Matches SANCTUM_STATEFUL_DOMAINS (.env) — that list already covers both
    // localhost:5173 and 127.0.0.1:5173 since Vite's dev server answers on
    // both, but this list hadn't been kept in sync with it. A request from
    // whichever one wasn't listed here would be silently blocked by the
    // browser's CORS check — the request can still complete server-side
    // (e.g. registration succeeding and the OTP email still being sent/
    // logged), but the frontend never sees the response, which looks
    // exactly like nothing happened.
    'allowed_origins' => ['http://localhost:5173', 'http://127.0.0.1:5173'],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
