/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    // `node` by default — everything under test here is pure logic — the
    // attention model, the date helpers, the mail store's seed and mutations
    // — none of which touch the DOM at import or call time. Keeping the
    // default environment at `node` means most files pay no jsdom cost.
    //
    // `.test.tsx` files opt into jsdom individually via a
    // `// @vitest-environment jsdom` docblock at the top of the file, rather
    // than flipping this globally — the day a test genuinely needs a
    // document (Settings' auto-send dialog/banner: real render + click,
    // not just the logic behind them) is the day that ONE file gets it,
    // not every existing `.test.ts` file that already runs fine without one.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
