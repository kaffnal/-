import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Ensure paths are relative so the app works even if not at the domain root
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});