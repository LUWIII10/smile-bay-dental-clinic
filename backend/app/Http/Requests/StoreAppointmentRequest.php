<?php

namespace App\Http\Requests;

use App\Models\AppointmentMedicalRecord;
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
            // Omitted/null means "myself" — present means this booking is
            // for one of the logged-in patient's own minor dependents.
            // Re-checked (ownership, is_dependent) in AppointmentController
            // ::store() itself; this is defense-in-depth, not the
            // authoritative check, since the authoritative one needs the
            // already-resolved $patient row anyway.
            'dependent_id' => [
                'nullable', 'integer',
                Rule::exists('patients', 'id')
                    ->where('is_dependent', true)
                    ->where('parent_patient_id', $this->user()?->patient?->id),
            ],
            // Additional Info (free-text notes) was dropped from the
            // booking wizard in favor of the structured Medical Record step
            // below — kept nullable (not removed) so old clients/rows never
            // break, but the wizard no longer sends it.
            'notes' => ['nullable', 'string', 'max:1000'],
            // Shared with StaffAppointmentController::assignWalkIn() via
            // AppointmentMedicalRecord::validationRules() — see that method
            // for the pregnant_or_breastfeeding-is-nullable reasoning.
            ...AppointmentMedicalRecord::validationRules('medical_record'),
            // Sent only by BookFollowUp.jsx — the completed appointment whose
            // recommendation this booking must fulfill. See
            // FollowUpRecommendationService::lockAndValidate(): existence
            // alone is checked here, the strict re-check (still open, still
            // this patient/service) runs inside the booking transaction.
            'fulfills_appointment_id' => ['nullable', 'integer', 'exists:appointments,id'],
            'appointment_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'appointment_time' => ['required', 'date_format:H:i'],
        ];
    }
}
