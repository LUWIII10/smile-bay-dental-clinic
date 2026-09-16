import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchCurrentUser = useCallback(async () => {
        try {
            const response = await api.get('/api/auth/me');
            setUser(response.data.user);
        } catch (err) {
            setUser(null);
        }
    }, []);

    // On first load, check if a session already exists (e.g. after page refresh)
    useEffect(() => {
        (async () => {
            setLoading(true);
            await fetchCurrentUser();
            setLoading(false);
        })();
    }, [fetchCurrentUser]);

    const login = async (email, password) => {
        setError(null);
        try {
            await api.get('/sanctum/csrf-cookie');
            const response = await api.post('/api/auth/login', { email, password });
            setUser(response.data.user);
            return { success: true, role: response.data.user.role };
        } catch (err) {
            const message = err.response?.data?.message || 'Login failed.';
            setError(message);
            return {
                success: false,
                message,
                unverified: err.response?.data?.unverified || false,
                email: err.response?.data?.email || null,
            };
        }
    };

    // Creates a pending (unverified) account; does not log the user in.
    // The account is only activated once verifyOtp() succeeds.
    const register = async (payload) => {
        setError(null);
        try {
            await api.get('/sanctum/csrf-cookie');
            const response = await api.post('/api/auth/register', payload);
            return {
                success: true,
                email: response.data.email,
                retryAfter: response.data.retry_after,
                // false when the account was created but the verification
                // email could not be sent (SMTP down) — the verify screen
                // uses this to tell the user to use "Resend code" instead of
                // waiting for a code that never left.
                emailSent: response.data.email_sent !== false,
            };
        } catch (err) {
            const message = err.response?.data?.message || 'Registration failed. Please try again.';
            const errors = err.response?.data?.errors || null;
            setError(message);
            return { success: false, message, errors };
        }
    };

    const verifyOtp = async (email, otp) => {
        try {
            await api.get('/sanctum/csrf-cookie');
            const response = await api.post('/api/auth/verify-otp', { email, otp });
            return { success: true, message: response.data.message };
        } catch (err) {
            return { success: false, message: err.response?.data?.message || 'Verification failed.' };
        }
    };

    const resendOtp = async (email) => {
        try {
            await api.get('/sanctum/csrf-cookie');
            const response = await api.post('/api/auth/resend-otp', { email });
            return { success: true, message: response.data.message, retryAfter: response.data.retry_after };
        } catch (err) {
            return {
                success: false,
                message: err.response?.data?.message || 'Could not resend the code.',
                retryAfter: err.response?.data?.retry_after || null,
            };
        }
    };

    // Always reports success-shaped data regardless of whether the email
    // matches an account — mirrors the backend's enumeration-prevention
    // wording. retryAfter passes through when present so the reset OTP
    // screen's cooldown timer still works.
    const forgotPassword = async (email) => {
        try {
            await api.get('/sanctum/csrf-cookie');
            const response = await api.post('/api/auth/forgot-password', { email });
            return {
                success: true,
                message: response.data.message,
                retryAfter: response.data.retry_after,
            };
        } catch (err) {
            return {
                success: false,
                message: err.response?.data?.message || 'Something went wrong. Please try again.',
            };
        }
    };

    const verifyResetOtp = async (email, otp) => {
        try {
            await api.get('/sanctum/csrf-cookie');
            const response = await api.post('/api/auth/verify-reset-otp', { email, otp });
            return { success: true, message: response.data.message };
        } catch (err) {
            return { success: false, message: err.response?.data?.message || 'Invalid or expired code.' };
        }
    };

    const resetPassword = async (email, otp, password, passwordConfirmation) => {
        try {
            await api.get('/sanctum/csrf-cookie');
            const response = await api.post('/api/auth/reset-password', {
                email,
                otp,
                password,
                password_confirmation: passwordConfirmation,
            });
            return { success: true, message: response.data.message };
        } catch (err) {
            const message = err.response?.data?.message || 'Could not reset your password. Please try again.';
            const errors = err.response?.data?.errors || null;
            return { success: false, message, errors };
        }
    };

    const logout = async () => {
        try {
            // Every other mutating call in this file re-fetches the CSRF cookie
            // immediately before its POST; logout() was the one call that
            // didn't, which was inconsistent (not the cause of the 500 — that
            // was a backend guard bug — but a real gap if the CSRF cookie ever
            // rotates mid-session).
            await api.get('/sanctum/csrf-cookie');
            await api.post('/api/auth/logout');
        } catch (err) {
            // Even if the request fails, clear local state so the UI reflects logged-out.
        } finally {
            setUser(null);
        }
    };

    const value = {
        user,
        role: user?.role ?? null,
        isAuthenticated: !!user,
        loading,
        error,
        login,
        register,
        verifyOtp,
        resendOtp,
        forgotPassword,
        verifyResetOtp,
        resetPassword,
        logout,
        refreshUser: fetchCurrentUser,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}