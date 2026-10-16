import { SV_MODE } from "./tenant.ts";
if (SV_MODE) document.title = "Spring Valley Roofing | AI Receptionist";
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
