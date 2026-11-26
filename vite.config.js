import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
  },
  server: {
    host: 'localhost',
    port: 5842,
    strictPort: true,
  },
});
