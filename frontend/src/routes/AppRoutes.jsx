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
import ComingSoon from '../pages/portal/ComingSoon';
import { NAV_CONFIG } from '../pages/portal/navConfig';

// Renders one <Route> per nav item for a role, pointing every entry other
// than the dashboard itself at the ComingSoon placeholder — keeps the
// sidebar fully clickable without hand-listing each path here.
function roleRoutes(role, dashboardPath, DashboardComponent) {
    return NAV_CONFIG[role].map((item) =>
        item.path === dashboardPath ? (
            <Route key={item.path} path={item.path} element={<DashboardComponent />} />
        ) : (
            <Route key={item.path} path={item.path} element={<ComingSoon />} />
        )
    );
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
                {roleRoutes('patient', '/patient/dashboard', PatientDashboard)}
            </Route>

            <Route
                element={
                    <ProtectedRoute allowedRoles={['dentist']}>
                        <PortalLayout />
                    </ProtectedRoute>
                }
            >
                {roleRoutes('dentist', '/dentist/dashboard', DentistDashboard)}
            </Route>

            <Route
                element={
                    <ProtectedRoute allowedRoles={['dental_assistant']}>
                        <PortalLayout />
                    </ProtectedRoute>
                }
            >
                {roleRoutes('dental_assistant', '/assistant/dashboard', AssistantDashboard)}
            </Route>

            <Route
                element={
                    <ProtectedRoute allowedRoles={['admin']}>
                        <PortalLayout />
                    </ProtectedRoute>
                }
            >
                {roleRoutes('admin', '/admin/dashboard', AdminDashboard)}
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
    );
}

export default AppRoutes;
