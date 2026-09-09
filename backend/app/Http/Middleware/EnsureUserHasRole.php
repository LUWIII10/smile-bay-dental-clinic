<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserHasRole
{
    /**
     * Restrict access to users whose `role` matches one of the given roles.
     * Usage in routes: ->middleware(['auth:sanctum', 'role:admin'])
     * or multiple roles: ->middleware(['auth:sanctum', 'role:dentist,dental_assistant'])
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user || ! in_array($user->role, $roles, true)) {
            return response()->json([
                'message' => 'You do not have permission to access this resource.',
            ], 403);
        }

        // An account deactivated mid-session must lose access immediately,
        // not only at next login (AuthController::login() has the same
        // guard). Applies to every role-gated route.
        if ($user->status !== 'active') {
            return response()->json([
                'message' => 'Your account has been deactivated. Please contact the clinic.',
            ], 403);
        }

        return $next($request);
    }
}