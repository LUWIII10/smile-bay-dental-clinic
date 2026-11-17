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
            // Additional Info (free-text notes) was dropped from the
            // booking wizard in favor of the structured Medical Record step
            // below — kept nullable (not removed) so old clients/rows never
            // break, but the wizard no longer sends it.
            'notes' => ['nullable', 'string', 'max:1000'],
            'medical_record' => ['required', 'array'],
            'medical_record.high_blood_pressure' => ['required', 'boolean'],
            'medical_record.high_blood_pressure_notes' => ['nullable', 'string', 'max:500'],
            'medical_record.diabetes' => ['required', 'boolean'],
            'medical_record.diabetes_notes' => ['nullable', 'string', 'max:500'],
            'medical_record.heart_condition' => ['required', 'boolean'],
            'medical_record.heart_condition_notes' => ['nullable', 'string', 'max:500'],
            'medical_record.asthma' => ['required', 'boolean'],
            'medical_record.asthma_notes' => ['nullable', 'string', 'max:500'],
            'medical_record.bleeding_disorder' => ['required', 'boolean'],
            'medical_record.bleeding_disorder_notes' => ['nullable', 'string', 'max:500'],
            'medical_record.allergies' => ['required', 'boolean'],
            'medical_record.allergies_notes' => ['nullable', 'string', 'max:500'],
            'medical_record.taking_medications' => ['required', 'boolean'],
            'medical_record.taking_medications_notes' => ['nullable', 'string', 'max:500'],
            'medical_record.recent_surgery' => ['required', 'boolean'],
            'medical_record.recent_surgery_notes' => ['nullable', 'string', 'max:500'],
            // Omitted entirely (not just false) for a male patient — never
            // required, since the wizard never even shows this question
            // then.
            'medical_record.pregnant_or_breastfeeding' => ['nullable', 'boolean'],
            'medical_record.pregnant_or_breastfeeding_notes' => ['nullable', 'string', 'max:500'],
            'medical_record.other_concerns' => ['nullable', 'string', 'max:1000'],
            'medical_record.consent_given' => ['required', 'accepted'],
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
