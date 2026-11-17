import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base: the built bundle works at any GitHub Pages path
// (https://rowanflynnpilot.github.io/wpr-happy-hour/) with no config edits.
// Four pages: the app, plus the newsletter card, the spotlight ad and the link
// preview image that scripts/render-digest.mjs screenshots.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: 'index.html', digest: 'digest.html', spotlight: 'spotlight.html', og: 'og.html' },
    },
  },
});
