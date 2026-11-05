import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/app.css';
import { store, currentTenant } from './store/store';
import { applyAppearance } from './lib/theme';

// Apply persisted appearance before first paint to avoid a theme flash.
applyAppearance(currentTenant(store.get()).data.appearance);

// StrictMode is intentionally off: its double mount/unmount in dev would replay exit animations.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
