import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteSingleFile() // This plugin inlines all JS/CSS into the HTML
  ],
  base: './', // Essential for file:// protocol
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});