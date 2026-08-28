import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import { App } from './App';
import { useApp } from './store';
import { mixEngine } from './lib/audio/engine';

// Development only: lets the store and mixer be inspected from the console, and
// driven from a browser-automation session where there is no folder dialog.
if (import.meta.env.DEV) {
  Object.assign(window, { __autoDj: { store: useApp, engine: mixEngine } });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
