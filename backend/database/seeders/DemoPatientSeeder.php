<?php

namespace Database\Seeders;

use App\Models\{Appointment, AppointmentStatusLog, ClinicalNote, ClinicSchedule, DentalRecord, HmoProvider, Patient, Service, TreatmentHistory, User};
use App\Services\AppointmentSlotService;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\{DB, Hash};
use RuntimeException;

class DemoPatientSeeder extends Seeder
{
    public ?Carbon $anchor = null;
    public bool $presentation = false;
    private array $reserved = [];

    public function run(): void
    {
        $today = ($this->anchor ?? Carbon::today('Asia/Manila'))->copy()->startOfDay();
        $emails = $this->patientEmails();
        $existing = User::whereIn('email', $emails)->get();
        if ($existing->count() === 50 && Patient::whereIn('user_id', $existing->modelKeys())->count() === 50) {
            $this->command?->info('The 50 demo patients already exist; no records changed.');
            return;
        }
        if ($existing->isNotEmpty()) {
            throw new RuntimeException('A partial demo cohort or email collision exists. No data was changed; inspect it before proceeding.');
        }

        $dentists = User::where('role', 'dentist')->where('status', 'active')->with('services')->orderBy('id')->get();
        $providers = HmoProvider::where('is_active', true)->orderBy('id')->get();
        $staff = User::whereIn('role', ['admin', 'dental_assistant'])->where('status', 'active')->orderBy('id')->first();
        $services = Service::where('is_active', true)->where('duration_minutes', '>', 0)->orderBy('id')->get();
        foreach ([false, true] as $pediatric) {
            if (! $services->contains(fn ($s) => $s->isPediatric() === $pediatric && $dentists->contains(fn ($d) => $d->services->contains('id', $s->id)))) {
                throw new RuntimeException('Existing active general and pediatric services with credentialed dentists are required.');
            }
        }
        if (! $staff || $providers->isEmpty()) {
            throw new RuntimeException('An existing active staff/admin account and HMO provider are required.');
        }

        $names = [
            ['Gabriel Luis','Mercado','Navarro'], ['Sofia Isabelle','Ramos','Soriano'],
            ['Nathaniel Enzo','Aquino','Velasco'], ['Chloe Alessandra','Torres','Domingo'],
            ['Rafael Andres','Castillo','Salazar'], ['Bianca Elise','Flores','Manalo'],
            ['Liam Rafael','Santiago','Dizon'], ['Mikaela Hope','Cruz','Aguilar'],
            ['Adrian Paolo','Garcia','Tolentino'], ['Camille Denise','Perez','Valdez'],
            ['Christian Noel','Reyes','Ocampo'], ['Janelle Faith','Mendoza','Panganiban'],
            ['Daniel Ezekiel','Bautista','Rosales'], ['Alyssa Kate','Santos','Evangelista'],
            ['Vincent Carlo','Lopez','De Vera'], ['Erika Louise','Gonzales','Alcantara'],
            ['Francis Elijah','Rivera','Lacson'], ['Dianne Marielle','Fernandez','Alonzo'],
            ['Patrick Jerome','Villanueva','Cabrera'], ['Trisha Anne','Lim','Serrano'],
            ['Kenneth Ryan','Diaz','Fajardo'], ['Rochelle Joy','Gutierrez','Montes'],
            ['Jerome Alexis','Morales','Pascual'], ['Kristine Bea','Ramos','Escobar'],
            ['Aaron Joseph','Torres','Abad'], ['Mariel Grace','Aquino','Natividad'],
            ['Roland James','Castro','Buenaventura'], ['Hazel Marie','Santiago','Del Rosario'],
            ['Dennis Albert','Cruz','Villaflor'], ['Joanna Celeste','Garcia','Arce'],
            ['Eduardo Ramon','Mercado','Balagtas'], ['Liza Carmela','Perez','De Leon'],
            ['Roberto Miguel','Flores','Austria'], ['Monica Isabel','Reyes','Zamora'],
            ['Alfredo Cesar','Mendoza','Quintana'], ['Catherine Rose','Bautista','Pineda'],
            ['Rodrigo Emil','Santos','Magbanua'], ['Teresa Lourdes','Lopez','Valencia'],
            ['Mario Antonio','Gonzales','Samson'], ['Imelda Corazon','Rivera','Marquez'],
            ['Ernesto Felipe','Fernandez','Ledesma'], ['Rosario Elena','Villanueva','Bermudez'],
            ['Ricardo Manuel','Diaz','Balao'], ['Leonora Pilar','Gutierrez','Sison'],
            ['Danilo Victor','Morales','Aguinaldo'], ['Gloria Estela','Ramos','Cordero'],
            ['Nestor Joaquin','Torres','Paloma'], ['Cecilia Aurora','Aquino','Mallari'],
            ['Arturo Benjamin','Castillo','Soliman'], ['Virginia Lucinda','Flores','Estrella'],
        ];
        $ages = [5,6,7,8,9,10,11,12,14,15,16,17,18,19,21,22,23,24,25,26,28,29,31,32,34,35,37,38,40,41,43,44,46,47,49,50,52,54,56,58,60,61,63,64,65,67,69,71,73,76];
        $locations = [['Carmona','Cavite','4116'],['Biñan','Laguna','4024'],['Santa Rosa','Laguna','4026'],['San Pedro','Laguna','4023'],['General Mariano Alvarez','Cavite','4117'],['Dasmariñas','Cavite','4114']];
        $streets = ['Sampaguita','Narra','Amihan','Acacia','Dalisay','Hiraya'];
        $password = Hash::make('SmileBayDemo2026!');
        $this->reserved = [];

        DB::transaction(function () use ($today, $emails, $names, $ages, $locations, $streets, $password, $services, $dentists, $providers, $staff) {
            // Model inserts avoid controller mail/notifications and observers.
            User::withoutEvents(function () use ($today, $emails, $names, $ages, $locations, $streets, $password, $services, $dentists, $providers, $staff) {
                foreach ($names as $i => [$first, $middle, $last]) {
                    $age = $ages[$i];
                    $dob = $today->copy()->subYears($age)->subDays(17 + ($i * 7) % 180);
                    $registered = $today->copy()->subDays(50 + $i % 20)->setTime(10, 0);
                    $hmo = $i % 5 < 2;
                    $provider = $hmo ? $providers[$i % $providers->count()] : null;
                    // Masked Philippine-style numbers cannot be dialled or used for SMS.
                    $phone = sprintf('%sXXX%04d', ['0917','0928','0995'][$i % 3], $i + 1);
                    [$city, $province, $zip] = $locations[$i % 6];
                    $contact = 'Lorena '.$middle.' '.$last;
                    $user = User::create(['name' => "$first $middle $last", 'email' => $emails[$i], 'password' => $password,
                        'role' => 'patient', 'status' => 'active', 'mobile_number' => $phone,
                        'created_at' => $registered, 'updated_at' => $registered]);
                    $user->forceFill(['email_verified_at' => $registered])->save();
                    $patient = Patient::create([
                        'user_id' => $user->id, 'first_name' => $first, 'middle_name' => $middle, 'last_name' => $last,
                        'date_of_birth' => $dob, 'sex' => $i % 2 === 0 ? 'male' : 'female',
                        'civil_status' => $age < 25 ? 'Single' : ($i % 3 === 0 ? 'Single' : 'Married'), 'nationality' => 'Filipino',
                        'occupation' => $age < 22 ? 'Student' : ($age >= 60 ? 'Retired' : ['Teacher','Office employee','Store owner','Technician','Accountant'][$i % 5]),
                        'address_line' => 'Block '.(2 + $i % 8).' Lot '.(3 + $i).' '.$streets[$i % 6].' Street, Likha Meadows',
                        'city' => $city, 'province' => $province, 'zip_code' => $zip,
                        'emergency_contact_name' => $contact, 'emergency_contact_relationship' => $age < 18 ? 'Mother' : 'Sibling',
                        'emergency_contact_number' => $phone,
                        'guardian_name' => $age < 18 ? $contact : null, 'guardian_relationship' => $age < 18 ? 'Mother' : null,
                        'guardian_contact_number' => $age < 18 ? $phone : null,
                        'allergies' => $i % 9 === 0 ? 'Seasonal pollen allergy' : 'None reported', 'current_medications' => 'None reported',
                        'medical_conditions' => [], 'previous_surgeries' => 'None reported',
                        'brushing_frequency' => $i % 7 === 0 ? 'Once daily' : 'Twice daily',
                        'dental_procedures_history' => [], 'current_dental_symptoms' => [],
                        'visit_reason' => ['Routine dental check-up','Mild tooth sensitivity','Routine dental cleaning','Follow-up consultation'][$i % 4],
                        'patient_type' => $hmo ? 'hmo' : 'cash', 'hmo_provider_id' => $provider?->id,
                        'hmo_number' => $hmo ? sprintf('SBD-2026-%06d', $i + 1) : null,
                        'hmo_company_name' => $hmo ? 'Likha Community Enterprises' : null,
                        'consent_certified' => true, 'created_at' => $registered, 'updated_at' => $registered,
                    ]);
                    $patient->update(['patient_number' => Patient::formatPatientNumber($patient->id, $registered)]);
                    $eligible = $services->filter(fn ($s) => $s->isPediatric() === ($age < 18)
                        && $dentists->contains(fn ($d) => $d->services->contains('id', $s->id)))->values();
                    // Common consultations/cleanings predominate; other real services vary.
                    $common = $eligible->filter(fn ($s) => preg_match('/consult|prophylaxis|cleaning/i', $s->name))->values();
                    $pool = $i % 3 !== 0 && $common->isNotEmpty() ? $common : $eligible;
                    $service = $pool[$i % $pool->count()];
                    $historicalStatus = $i < 40 ? 'completed' : ($i < 45 ? 'cancelled' : 'no_show');
                    $past = $this->appointment($patient, $service, $dentists, $staff,
                        $today->copy()->subDays(1 + ($i < 25 ? $i % 3 : $i % 28)), -1, $historicalStatus, $i, $today);
                    if ($historicalStatus === 'completed') {
                        $performed = Carbon::parse($past->appointment_date->toDateString().' '.$past->appointment_time)->addMinutes($service->duration_minutes);
                        $record = DentalRecord::create(['patient_id' => $patient->id, 'primary_dentist_id' => $past->dentist_id,
                            'record_number' => 'DEMO-'.($i + 1), 'opened_at' => $past->appointment_date, 'created_at' => $performed, 'updated_at' => $performed]);
                        $record->update(['record_number' => DentalRecord::formatRecordNumber($record->id, $performed)]);
                        $note = $this->treatmentNote($service);
                        ClinicalNote::create(['dental_record_id' => $record->id, 'dentist_id' => $past->dentist_id,
                            'appointment_id' => $past->id, 'note' => $note, 'created_at' => $performed, 'updated_at' => $performed]);
                        TreatmentHistory::create(['dental_record_id' => $record->id, 'appointment_id' => $past->id,
                            'procedure_name' => $service->name, 'performed_by' => $past->dentist_id, 'performed_at' => $past->appointment_date,
                            'notes' => $note, 'created_at' => $performed, 'updated_at' => $performed]);
                        $patient->update(['last_dental_visit' => $past->appointment_date->toDateString(), 'last_dental_treatment' => $service->name,
                            'updated_at' => $performed]);
                    }
                    $pending = ($hmo || $service->isPediatric()) && $i % 3 !== 2;
                    $future = $this->appointment($patient, $service, $dentists, $staff,
                        $today->copy()->addDays(($this->presentation ? 0 : 1) + $i % 21), 1, $pending ? 'pending_verification' : 'confirmed', $i + 50, $today);
                    if ($i % 5 === 0 && $future->status === 'confirmed') {
                        // Rescheduling retains status, just as AppointmentController does.
                        [$oldDate, $oldTime] = $this->slot($service, $future->dentist, $future->appointment_date->copy()->addDays(3), 1);
                        $this->log($future, $future->status, $future->status, $future->dentist_id,
                            "Rescheduled by dentist from $oldDate $oldTime to {$future->appointment_date->toDateString()} {$future->appointment_time}.", $today->copy()->subHours(12));
                    }
                }
            });
        });
        $this->command?->info('Created 50 fictional patients, 100 appointments and 40 completed treatment histories.');
    }

    public function patientEmails(): array
    {
        if (! $this->presentation) {
            return array_map(fn ($n) => sprintf('demo.patient%03d@example.com', $n), range(1, 50));
        }

        $names = ['gabriel.navarro','sofia.soriano','nathaniel.velasco','chloe.domingo','rafael.salazar',
            'bianca.manalo','liam.dizon','mikaela.aguilar','adrian.tolentino','camille.valdez',
            'christian.ocampo','janelle.panganiban','daniel.rosales','alyssa.evangelista','vincent.devera',
            'erika.alcantara','francis.lacson','dianne.alonzo','patrick.cabrera','trisha.serrano',
            'kenneth.fajardo','rochelle.montes','jerome.pascual','kristine.escobar','aaron.abad',
            'mariel.natividad','roland.buenaventura','hazel.delrosario','dennis.villaflor','joanna.arce',
            'eduardo.balagtas','liza.deleon','roberto.austria','monica.zamora','alfredo.quintana',
            'catherine.pineda','rodrigo.magbanua','teresa.valencia','mario.samson','imelda.marquez',
            'ernesto.ledesma','rosario.bermudez','ricardo.balao','leonora.sison','danilo.aguinaldo',
            'gloria.cordero','nestor.paloma','cecilia.mallari','arturo.soliman','virginia.estrella'];

        // A mix of real consumer providers reads as genuine at a glance for a
        // defense demo — 50 people all on the same domain (even a realistic-
        // looking one) would itself look seeded. Safe to use real providers
        // here specifically because these users are created via
        // User::withoutEvents() above, which skips the mail/notification
        // observers that would otherwise actually send to these addresses.
        $providers = ['gmail.com', 'yahoo.com', 'outlook.com'];

        return array_map(fn ($name, $i) => $name.'@'.$providers[$i % count($providers)], $names, array_keys($names));
    }

    private function appointment(Patient $patient, Service $service, $dentists, User $staff, Carbon $target, int $direction, string $status, int $index, Carbon $today): Appointment
    {
        $eligible = $dentists->filter(fn ($d) => $d->services->contains('id', $service->id))->values();
        $dentist = $eligible[$index % $eligible->count()];
        [$date, $time] = $this->slot($service, $dentist, $target, $direction);
        $visit = Carbon::parse("$date $time");
        $booked = ($direction < 0 ? $visit->copy()->subDays(5) : $today->copy()->subDays(1))->setTime(9, 0);
        $initial = $service->isPediatric() || $patient->patient_type === 'hmo' ? 'pending_verification' : 'confirmed';
        $reviewed = $status !== 'pending_verification';
        $pediatricReviewed = $service->isPediatric() && ($reviewed || ($patient->patient_type === 'hmo' && $index % 2 === 0));
        $approvedAt = $booked->copy()->addHours(4);
        $terminalAt = $status === 'completed' || $status === 'no_show' ? $visit->copy()->addMinutes($service->duration_minutes) : $approvedAt->copy()->addDay();
        $appointment = Appointment::create([
            'patient_id' => $patient->id, 'dentist_id' => $dentist->id, 'service_id' => $service->id,
            'appointment_date' => $date, 'appointment_time' => $time, 'status' => $status,
            'patient_type_snapshot' => $patient->patient_type,
            'verified_by' => $patient->patient_type === 'hmo' && $reviewed ? $staff->id : null,
            'verified_at' => $patient->patient_type === 'hmo' && $reviewed ? $approvedAt : null,
            'pediatric_confirmed_by' => $pediatricReviewed ? $dentist->id : null,
            'pediatric_confirmed_at' => $pediatricReviewed ? $booked->copy()->addHours(2) : null,
            'cancellation_reason' => $status === 'cancelled' ? 'Patient requested cancellation due to a work or family commitment.' : null,
            'created_at' => $booked, 'updated_at' => $reviewed ? ($status === 'confirmed' ? $approvedAt : $terminalAt) : $booked,
        ]);
        $this->log($appointment, null, $initial, $patient->user_id, 'Booked by patient.', $booked);
        if ($pediatricReviewed) {
            $after = $patient->patient_type === 'cash' ? 'confirmed' : 'pending_verification';
            $this->log($appointment, $initial, $after, $dentist->id, 'Pediatric slot approved by dentist.', $booked->copy()->addHours(2));
            $initial = $after;
        }
        if ($reviewed && $initial === 'pending_verification') {
            $this->log($appointment, $initial, 'confirmed', $staff->id, 'HMO coverage verified by staff.', $approvedAt);
        }
        if (in_array($status, ['completed','cancelled','no_show'], true)) {
            $this->log($appointment, 'confirmed', $status, $status === 'cancelled' ? $patient->user_id : $dentist->id,
                $status === 'completed' ? 'Visit completed; oral hygiene instructions provided.' : ($status === 'cancelled' ? $appointment->cancellation_reason : 'Patient did not attend the scheduled visit.'), $terminalAt);
        }
        return $appointment;
    }

    private function slot(Service $service, User $dentist, Carbon $target, int $direction): array
    {
        $slots = app(AppointmentSlotService::class);
        for ($day = 0; $day < 45; $day++) {
            $date = $target->copy()->addDays($day * $direction);
            $clinic = ClinicSchedule::where('day_of_week', $date->dayOfWeek)->first();
            if (! $clinic?->is_open || ! $clinic->open_time || ! $clinic->close_time) {
                continue;
            }
            $start = Carbon::parse($date->toDateString().' '.$clinic->open_time);
            $close = Carbon::parse($date->toDateString().' '.$clinic->close_time);
            while ($start->copy()->addMinutes($service->duration_minutes)->lte($close) && $start->format('H:i') <= '16:30') {
                $key = $dentist->id.'|'.$date->toDateString();
                $end = $start->copy()->addMinutes($service->duration_minutes);
                $overlap = collect($this->reserved[$key] ?? [])->contains(fn ($r) => $start->lt($r[1]) && $end->gt($r[0]));
                if (! $overlap && $slots->isSlotAvailable($dentist->id, $date->toDateString(), $start->format('H:i'), $service->duration_minutes)) {
                    $this->reserved[$key][] = [$start->copy(), $end];
                    return [$date->toDateString(), $start->format('H:i')];
                }
                $start->addMinutes($service->duration_minutes);
            }
        }
        throw new RuntimeException("No valid demo slot for dentist {$dentist->id} and service {$service->id}. Entire seed rolled back.");
    }

    private function log(Appointment $appointment, ?string $old, string $new, int $actor, string $note, Carbon $at): void
    {
        $log = new AppointmentStatusLog(['appointment_id' => $appointment->id, 'old_status' => $old,
            'new_status' => $new, 'changed_by' => $actor, 'note' => $note]);
        $log->created_at = $at;
        $log->save();
    }

    private function treatmentNote(Service $service): string
    {
        return match (true) {
            (bool) preg_match('/extract/i', $service->name) => 'Tooth extraction completed. Routine aftercare instructions provided.',
            (bool) preg_match('/clean|prophylaxis/i', $service->name) => 'Routine dental cleaning completed. Oral hygiene instructions provided.',
            (bool) preg_match('/filling|restor/i', $service->name) => 'Dental caries managed with restoration. Follow-up recommended.',
            default => $service->name.' completed. Routine findings discussed; follow-up recommended.',
        };
    }
}
