import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base: the built bundle works at any GitHub Pages path
// (https://rowanflynnpilot.github.io/wpr-happy-hour/) with no config edits.
export default defineConfig({
  base: './',
  plugins: [react()],
});
