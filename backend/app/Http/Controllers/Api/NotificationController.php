<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\Request;

/**
 * Topbar bell — every role, scoped to the authenticated user inside each
 * method (never a route/body-supplied user id), same pattern as
 * ProfileController.
 */
class NotificationController extends Controller
{
    private const RECENT_LIMIT = 20;

    public function index(Request $request)
    {
        $userId = $request->user()->id;

        return response()->json([
            'data' => Notification::where('user_id', $userId)
                ->orderByDesc('created_at')
                ->limit(self::RECENT_LIMIT)
                ->get(),
            'unread_count' => Notification::where('user_id', $userId)->whereNull('read_at')->count(),
        ]);
    }

    public function markRead(Request $request, Notification $notification)
    {
        if ($notification->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Notification not found.'], 404);
        }

        if (! $notification->read_at) {
            $notification->update(['read_at' => now()]);
        }

        return response()->json(['message' => 'Marked as read.']);
    }

    public function markAllRead(Request $request)
    {
        Notification::where('user_id', $request->user()->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['message' => 'All notifications marked as read.']);
    }
}
