import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    port: 3000,
    // HTTPS is required for camera access in some browsers
    https: false
  }
});

