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

            // Optional medical / dental information
            'allergies' => ['nullable', 'string', 'max:1000'],
            'current_medications' => ['nullable', 'string', 'max:1000'],
            'medical_conditions_notes' => ['nullable', 'string', 'max:1000'],

            // Patient category — HMO patients must supply coverage details
            // upfront so staff can manually verify before their first
            // appointment is confirmed; cash patients need none of this.
            // Currently accepted HMOs are restricted to Medicard and
            // Flexicare — enforced here too, not just in the dropdown,
            // since a client-side-only restriction isn't a real guardrail.
            'patient_type' => ['required', 'in:cash,hmo'],
            'hmo_provider_id' => [
                'required_if:patient_type,hmo',
                'nullable',
                'integer',
                Rule::exists('hmo_providers', 'id')->where(fn ($query) => $query->whereIn('name', ['Medicard', 'Flexicare'])),
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
