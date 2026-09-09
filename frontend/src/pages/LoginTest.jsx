import { useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

function LoginTest() {
    const auth = useAuth();
    const [email, setEmail] = useState('juan@example.com');
    const [password, setPassword] = useState('password123');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(null);
        setResult(null);

        try {
            // Step 1: Get CSRF cookie first
            await api.get('/sanctum/csrf-cookie');

            // Step 2: Attempt login
            const response = await api.post('/api/auth/login', {
                email,
                password,
            });

            setResult(response.data);
        } catch (err) {
            setError(err.response?.data || { message: 'Something went wrong.' });
        }
    };

    const checkCurrentUser = async () => {
        setError(null);
        try {
            const response = await api.get('/api/auth/me');
            setResult(response.data);
        } catch (err) {
            setError(err.response?.data || { message: 'Not authenticated.' });
        }
    };

    return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
            <h2>Login Test</h2>
            <div style={{ background: '#def', padding: '1rem', marginBottom: '1rem' }}>
    <strong>AuthContext State:</strong>
    <pre>{JSON.stringify({ isAuthenticated: auth.isAuthenticated, role: auth.role, loading: auth.loading, user: auth.user }, null, 2)}</pre>
</div>
            <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '1rem' }}>
                    <label>Email: </label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label>Password: </label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </div>
                <button type="submit">Login</button>
            </form>

            <button onClick={checkCurrentUser} style={{ marginTop: '1rem' }}>
                Check Current User (/api/auth/me)
            </button>
            <button onClick={auth.logout} style={{ marginTop: '1rem', marginLeft: '1rem' }}>
                Logout (via AuthContext)
            </button>

            {result && (
                <pre style={{ background: '#eee', padding: '1rem', marginTop: '1rem' }}>
                    {JSON.stringify(result, null, 2)}
                </pre>
            )}

            {error && (
                <pre style={{ background: '#fdd', padding: '1rem', marginTop: '1rem' }}>
                    {JSON.stringify(error, null, 2)}
                </pre>
            )}
        </div>
    );
}

export default LoginTest;