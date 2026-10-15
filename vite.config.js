import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // One bundle of about 700 kB (200 kB gzipped) is fine for now; it replaced
  // a 3 MB in-browser compiler. Split per screen when it starts to matter.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
  },
});
