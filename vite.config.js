import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base: the built bundle works at any GitHub Pages path
// (https://rowanflynnpilot.github.io/wpr-happy-hour/) with no config edits.
// The app, plus the pages scripts/render-digest.mjs screenshots (the newsletter
// card, the spotlight ad, the link preview image) the printable table tent and the owner's listing check.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: 'index.html', digest: 'digest.html', spotlight: 'spotlight.html', og: 'og.html', tent: 'tent.html', confirm: 'confirm.html' },
    },
  },
});
