import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Wraps a route so it requires authentication (and optionally a specific role).
 * This is a UX convenience only — the real security boundary is Laravel's
 * auth:sanctum + role middleware, which we already verified in Phase 3A.
 */
function ProtectedRoute({ children, allowedRoles }) {
    const { isAuthenticated, loading, role } = useAuth();

    if (loading) {
        return <div style={{ padding: '2rem' }}>Checking session...</div>;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(role)) {
        return <Navigate to="/unauthorized" replace />;
    }

    return children;
}

export default ProtectedRoute;