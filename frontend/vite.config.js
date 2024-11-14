import { defineConfig } from 'vite';
import { resolve } from 'path';
import preact from '@preact/preset-vite';

const outDir = resolve(__dirname, 'dist');

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [preact()],
  build: {
    outDir,
    rollupOptions: {
      input: {
        'index.html': 'index.html',
        'close.html': 'close.html'
      },
    },
  }
});
