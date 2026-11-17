import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { store } from './store';
import { queryClient } from './lib/queryClient';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import { SlowServerNotice } from './components/shared/SlowServerNotice';
import './styles/tokens.css';
import './styles/app.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
          <SlowServerNotice />
          <Toaster position="top-right" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--font-body)' } }} />
        </QueryClientProvider>
      </Provider>
    </ErrorBoundary>
  </StrictMode>,
);
