/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    // `node`, not `jsdom`: everything under test here is pure logic — the
    // attention model, the date helpers, the mail store's seed and mutations
    // — none of which touch the DOM at import or call time. Keeping the
    // environment at `node` means no extra dependency and a fast run; the
    // day a test genuinely needs a document, that's the day to add jsdom.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
