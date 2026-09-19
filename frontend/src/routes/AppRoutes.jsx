import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from '../pages/LandingPage';
import Login from '../pages/Login';
import RegisterWizard from '../pages/auth/registerSteps/RegisterWizard';
import VerifyOtp from '../pages/auth/VerifyOtp';
import ForgotPassword from '../pages/auth/ForgotPassword';
import ForgotPasswordVerify from '../pages/auth/ForgotPasswordVerify';
import ResetPassword from '../pages/auth/ResetPassword';
import Unauthorized from '../pages/Unauthorized';
import ProtectedRoute from './ProtectedRoute';
import PortalLayout from '../pages/portal/PortalLayout';
import PatientDashboard from '../pages/portal/PatientDashboard';
import DentistDashboard from '../pages/portal/DentistDashboard';
import AssistantDashboard from '../pages/portal/AssistantDashboard';
import AdminDashboard from '../pages/portal/AdminDashboard';
import BookAppointment from '../pages/portal/BookAppointment';
import PatientAppointments from '../pages/portal/PatientAppointments';
import PatientDentalRecords from '../pages/portal/PatientDentalRecords';
import PatientRecords from '../pages/portal/PatientRecords';
import MyProfile from '../pages/portal/MyProfile';
import UserManagement from '../pages/portal/UserManagement';
import Settings from '../pages/portal/Settings';
import Reports from '../pages/portal/Reports';
import DentistSchedule from '../pages/portal/DentistSchedule';
import CompletedPatients from '../pages/portal/CompletedPatients';
import MyAvailability from '../pages/portal/MyAvailability';
import PediatricQueue from '../pages/portal/PediatricQueue';
import HmoVerificationQueue from '../pages/portal/HmoVerificationQueue';
import AllAppointments from '../pages/portal/AllAppointments';
import ComingSoon from '../pages/portal/ComingSoon';
import { NAV_CONFIG } from '../pages/portal/navConfig';

// Renders one <Route> per nav item for a role. componentsByPath maps a
// handful of paths to their real component (dashboard always included,
// plus whichever other pages exist so far); every other nav item still
// falls back to the ComingSoon placeholder — keeps the sidebar fully
// clickable without hand-listing every path here.
function roleRoutes(role, componentsByPath) {
    return NAV_CONFIG[role].map((item) => {
        const Component = componentsByPath[item.path] || ComingSoon;
        return <Route key={item.path} path={item.path} element={<Component />} />;
    });
}

function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<RegisterWizard />} />
            <Route path="/verify-email" element={<VerifyOtp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/forgot-password/verify" element={<ForgotPasswordVerify />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/unauthorized" element={<Unauthorized />} />

            <Route
                element={
                    <ProtectedRoute allowedRoles={['patient']}>
                        <PortalLayout />
                    </ProtectedRoute>
                }
            >
                {roleRoutes('patient', {
                    '/patient/dashboard': PatientDashboard,
                    '/patient/book-appointment': BookAppointment,
                    '/patient/appointments': PatientAppointments,
                    '/patient/dental-records': PatientDentalRecords,
                    '/patient/profile': MyProfile,
                })}
            </Route>

            <Route
                element={
                    <ProtectedRoute allowedRoles={['dentist']}>
                        <PortalLayout />
                    </ProtectedRoute>
                }
            >
                {roleRoutes('dentist', {
                    '/dentist/dashboard': DentistDashboard,
                    '/dentist/schedule': DentistSchedule,
                    '/dentist/availability': MyAvailability,
                    '/dentist/pediatric-queue': PediatricQueue,
                    '/dentist/patient-records': PatientRecords,
                    '/dentist/completed-patients': CompletedPatients,
                    '/dentist/profile': MyProfile,
                })}
            </Route>

            <Route
                element={
                    <ProtectedRoute allowedRoles={['dental_assistant']}>
                        <PortalLayout />
                    </ProtectedRoute>
                }
            >
                {roleRoutes('dental_assistant', {
                    '/assistant/dashboard': AssistantDashboard,
                    '/assistant/appointments': AllAppointments,
                    '/assistant/hmo-verification': HmoVerificationQueue,
                    '/assistant/patient-records': PatientRecords,
                    '/assistant/profile': MyProfile,
                })}
            </Route>

            <Route
                element={
                    <ProtectedRoute allowedRoles={['admin']}>
                        <PortalLayout />
                    </ProtectedRoute>
                }
            >
                {roleRoutes('admin', {
                    '/admin/dashboard': AdminDashboard,
                    '/admin/appointments': AllAppointments,
                    '/admin/hmo-verification': HmoVerificationQueue,
                    '/admin/patient-records': PatientRecords,
                    '/admin/users': UserManagement,
                    '/admin/settings': Settings,
                    '/admin/reports': Reports,
                })}
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
    );
}

export default AppRoutes;
