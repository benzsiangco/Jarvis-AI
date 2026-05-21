import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:6767',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) return 'editor';
          if (id.includes('react-syntax-highlighter') || id.includes('react-markdown')) return 'markdown';
          if (id.includes('lucide-react') || id.includes('/lucide/')) return 'icons';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('scheduler')) return 'react';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});
