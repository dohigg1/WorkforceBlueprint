import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

// Bakes the captured live data into a single self-contained HTML file so the
// real app UI can be shared as a link with no backend. window.__WFB_STATIC__ is
// read by src/api.ts, which then resolves every call from the bundle.
const dataPath = process.env.STATIC_DATA as string;
const raw = readFileSync(dataPath, 'utf8').replace(/</g, '\\u003c');

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),
    {
      name: 'wfb-inject-static',
      transformIndexHtml(html) {
        return html.replace('</head>', `<script>window.__WFB_STATIC__=${raw};</script></head>`);
      },
    },
  ],
  build: { outDir: 'dist-static', cssCodeSplit: false, assetsInlineLimit: 100000000 },
});
