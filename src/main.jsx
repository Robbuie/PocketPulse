import { createRoot } from 'react-dom/client';
import { Root } from './App';
import './styles/app.css';

createRoot(document.getElementById('root')).render(<Root/>);

// Production only: in development a cached page would hide code changes.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
