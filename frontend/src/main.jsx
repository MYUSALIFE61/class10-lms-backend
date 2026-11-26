import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { validateRuntimeConfig } from './config/env.js';
import './styles/app.css';

validateRuntimeConfig();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
