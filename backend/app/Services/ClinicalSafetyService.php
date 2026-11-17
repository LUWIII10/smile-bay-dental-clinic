<?php

namespace App\Services;

use App\Models\Service;

/**
 * Flags a booking for a dentist's clinical review when the Medical Record
 * answers conflict with something the chosen service is tagged as
 * involving (Settings > Services — same admin-configurable pattern as the
 * existing is_pediatric flag). Never auto-rejects: only ever returns
 * whether a human dentist needs to look at it, and why — the actual
 * decision (proceed, adjust, reschedule, decline) is always a person's,
 * via MedicalReviewController.
 */
class ClinicalSafetyService
{
    /**
     * @param  array<string, bool|null>  $answers  keyed by
     *                                              AppointmentMedicalRecord::QUESTIONS (e.g. ['pregnant_or_breastfeeding' => true, ...])
     */
    public function requiresReview(Service $service, array $answers): bool
    {
        return $this->conflictReasons($service, $answers) !== [];
    }

    /**
     * Human-readable reasons, for the dentist's review queue to show
     * exactly what triggered the flag — never just "flagged," always why.
     *
     * @return string[]
     */
    public function conflictReasons(Service $service, array $answers): array
    {
        $reasons = [];

        $pregnant = (bool) ($answers['pregnant_or_breastfeeding'] ?? false);
        if ($pregnant && ($service->involves_xray || $service->involves_sedation)) {
            $reasons[] = 'Patient declared pregnant/breastfeeding, and '.$service->name.' involves '.
                ($service->involves_xray ? 'X-ray' : 'sedation/anesthesia').'.';
        }

        if (($answers['bleeding_disorder'] ?? false) && $service->is_surgical) {
            $reasons[] = 'Patient declared a bleeding disorder, and '.$service->name.' is a surgical procedure.';
        }

        if (($answers['heart_condition'] ?? false) && $service->involves_sedation) {
            $reasons[] = 'Patient declared a heart condition, and '.$service->name.' involves sedation/anesthesia.';
        }

        if (($answers['asthma'] ?? false) && $service->involves_sedation) {
            $reasons[] = 'Patient declared asthma/breathing problems, and '.$service->name.' involves sedation/anesthesia.';
        }

        return $reasons;
    }
}
