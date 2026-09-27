import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import { useMobileFormFocus } from './hooks/useMobileFormFocus';

function App() {
    useMobileFormFocus();

    return (
        <BrowserRouter>
            <AppRoutes />
        </BrowserRouter>
    );
}

export default App;
