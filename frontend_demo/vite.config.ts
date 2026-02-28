import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4075',
        changeOrigin: true
      },
      '/perturb': {
        target: 'http://localhost:4075',
        changeOrigin: true,
        secure: false
      },
      '/verify': {
        target: 'http://localhost:4075',
        changeOrigin: true,
        secure: false
      },
      '/health': {
        target: 'http://localhost:4075',
        changeOrigin: true,
        secure: false
      },
      '/save_results': {
        target: 'http://localhost:4075',
        changeOrigin: true,
        secure: false
      },
      '/inference_lab': {
        target: 'http://localhost:4075',
        changeOrigin: true,
        secure: false
      },
      '/inference_lab_choice': {
        target: 'http://localhost:4075',
        changeOrigin: true,
        secure: false
      },
      '/config': {
        target: 'http://localhost:4075',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
