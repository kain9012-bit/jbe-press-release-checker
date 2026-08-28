import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages 하위 경로(/저장소이름/)에서도 동작하도록 상대경로로 빌드한다.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1600 },
  server: { port: 3100, host: '0.0.0.0' },
});
