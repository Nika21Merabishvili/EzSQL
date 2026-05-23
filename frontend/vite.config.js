import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Forward /api and /accounts to Django.
      // changeOrigin is intentionally NOT set (defaults to false) so Vite
      // preserves the Host: localhost:5173 header.  Django then sees the
      // correct host and allauth builds the OAuth callback URL as
      // http://localhost:5173/accounts/google/login/callback/ — matching
      // what is registered in Google Cloud Console.
      '/api': {
        target: 'http://localhost:8000',
      },
      '/accounts': {
        target: 'http://localhost:8000',
      },
    },
  },
});
