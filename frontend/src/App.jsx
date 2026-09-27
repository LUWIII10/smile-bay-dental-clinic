import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import { useLockZoomOnFocus } from './hooks/useLockZoomOnFocus';

function App() {
    useLockZoomOnFocus();

    return (
        <BrowserRouter>
            <AppRoutes />
        </BrowserRouter>
    );
}

export default App;
