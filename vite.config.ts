import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || 'REDACTED_API_KEY';
  return {
    base: process.env.VITE_BASE || (mode === 'production' ? '/BlueprintHVACAIVoiceAssistant/' : '/'),
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
      'process.env.VITE_WHITE_LABEL': JSON.stringify(env.VITE_WHITE_LABEL || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 2000,
    }
  };
});
