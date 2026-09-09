<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAppointmentRequest extends FormRequest
{
    /**
     * Route already requires auth:sanctum + role:patient — this only
     * confirms the session actually resolved to a user, same shape as the
     * rest of this app's FormRequests.
     */
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            // Scoped to role=dentist + status=active — a plain exists:users,id
            // would also accept a patient/staff id or a deactivated dentist
            // (DentistController::index()'s own picker already filters to
            // this same set, so a stale cached dentist_id or a direct API
            // call can't book someone who shouldn't be bookable).
            'dentist_id' => [
                'required', 'integer',
                Rule::exists('users', 'id')->where('role', 'dentist')->where('status', 'active'),
            ],
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'appointment_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'appointment_time' => ['required', 'date_format:H:i'],
        ];
    }
}
