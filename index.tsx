import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/theme.css';
import App from './App';
import { CONFIG } from './config';
import { applyAppearanceToRoot, readStoredAppearance } from './utils/appearance';

// Paint the saved theme before React mounts, so a dark or tinted theme never flashes paper first.
applyAppearanceToRoot(
  document.documentElement,
  readStoredAppearance(CONFIG.STORAGE_KEY),
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches,
);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);