<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RegisterRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     * Public endpoint — anyone can attempt to register as a patient.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     */
    public function rules(): array
    {
        return [
            // Personal information
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'date_of_birth' => ['required', 'date', 'before:today'],
            'sex' => ['required', 'in:male,female'],
            'mobile_number' => ['required', 'string', 'regex:/^(09\d{9}|\+639\d{9})$/', 'unique:users,mobile_number'],
            'civil_status' => ['nullable', 'string', 'max:100'],
            'nationality' => ['nullable', 'string', 'max:100'],
            'religion' => ['nullable', 'string', 'max:100'],
            'occupation' => ['nullable', 'string', 'max:150'],

            // Contact information
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'complete_address' => ['required', 'string', 'max:500'],

            // Account security
            'password' => [
                'required',
                'string',
                'min:8',
                'confirmed',
                'regex:/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/',
            ],

            // Emergency contact
            'emergency_contact_name' => ['required', 'string', 'max:255'],
            'emergency_contact_relationship' => ['required', 'string', 'max:100'],
            'emergency_contact_number' => ['required', 'string', 'regex:/^[0-9+\-\s]{7,20}$/'],

            // Guardian / parent — only ever shown by the frontend for a
            // minor patient, but left optional here rather than
            // conditionally required: the age check would have to be
            // re-derived server-side from date_of_birth, and a missing
            // guardian contact is a front-desk follow-up, not something
            // that should block account creation outright.
            'guardian_name' => ['nullable', 'string', 'max:255'],
            'guardian_relationship' => ['nullable', 'string', 'max:100'],
            'guardian_contact_number' => ['nullable', 'string', 'regex:/^[0-9+\-\s]{7,20}$/'],

            // Optional medical / dental information
            'allergies' => ['nullable', 'string', 'max:1000'],
            'current_medications' => ['nullable', 'string', 'max:1000'],
            'medical_conditions_notes' => ['nullable', 'string', 'max:1000'],
            'blood_type' => ['nullable', 'string', 'max:10'],
            'medical_conditions' => ['nullable', 'array'],
            'medical_conditions.*' => ['string', 'max:100'],
            'previous_surgeries' => ['nullable', 'string', 'max:1000'],
            'last_physical_exam' => ['nullable', 'string', 'max:100'],
            'physician_name_specialty' => ['nullable', 'string', 'max:255'],

            // Dental history
            'last_dental_visit' => ['nullable', 'string', 'max:100'],
            'last_dental_treatment' => ['nullable', 'string', 'max:255'],
            'brushing_frequency' => ['nullable', 'string', 'max:100'],
            'dental_procedures_history' => ['nullable', 'array'],
            'dental_procedures_history.*' => ['string', 'max:100'],
            'current_dental_symptoms' => ['nullable', 'array'],
            'current_dental_symptoms.*' => ['string', 'max:100'],
            'visit_reason' => ['nullable', 'string', 'max:1000'],

            // Patient category — HMO patients must supply coverage details
            // upfront so staff can manually verify before their first
            // appointment is confirmed; cash patients need none of this.
            // Accepted HMOs are whatever's active in hmo_providers — the
            // admin manages that list from Settings now (Clinic
            // SettingsController::storeHmoProvider() et al.), so this used
            // to hardcode a two-name allowlist (Medicard/Flexicare) that
            // would have silently ignored any provider added there.
            'patient_type' => ['required', 'in:cash,hmo'],
            'hmo_provider_id' => [
                'required_if:patient_type,hmo',
                'nullable',
                'integer',
                Rule::exists('hmo_providers', 'id')->where('is_active', true),
            ],
            'hmo_number' => ['required_if:patient_type,hmo', 'nullable', 'string', 'max:100'],
            'hmo_company_name' => ['required_if:patient_type,hmo', 'nullable', 'string', 'max:255'],

            // Terms
            'agree_terms' => ['accepted'],
        ];
    }

    /**
     * Custom error messages (optional, but improves UX for the React frontend).
     */
    public function messages(): array
    {
        return [
            'date_of_birth.before' => 'Date of birth must be in the past.',
            'email.unique' => 'This email is already registered.',
            'mobile_number.regex' => 'Enter a valid Philippine mobile number (e.g. 09171234567).',
            'mobile_number.unique' => 'This mobile number is already registered.',
            'password.confirmed' => 'Password confirmation does not match.',
            'password.regex' => 'Password must include an uppercase letter, a number, and a special character.',
            'emergency_contact_number.regex' => 'Enter a valid contact number.',
            'hmo_provider_id.required_if' => 'Please select your HMO provider.',
            'hmo_provider_id.exists' => 'Please select a valid HMO provider.',
            'hmo_number.required_if' => 'HMO card / member ID number is required.',
            'hmo_company_name.required_if' => 'Company name / employer is required.',
            'agree_terms.accepted' => 'Please accept the Terms & Conditions to continue.',
        ];
    }
}
