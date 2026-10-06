import { defineConfig, normalizePath, type Plugin } from 'vite';
import path from 'node:path';

// One song per server: ATF_RUN=<outputs/run dir> is served at /run/ (audio.json, lyrics.json, input.wav).
const RUN = process.env.ATF_RUN ? path.resolve(process.env.ATF_RUN) : null;

function runAssets(): Plugin {
  return {
    name: 'run-assets',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (RUN && req.url?.startsWith('/run/')) req.url = `/@fs/${encodeURI(normalizePath(RUN))}${req.url.slice(4)}`;
        next();
      });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [runAssets()],
  // ATF_NO_HMR=1: no live reload (export renders must not reload mid-run when a file changes)
  server: { port: 5173, strictPort: false, hmr: process.env.ATF_NO_HMR ? false : undefined, fs: { allow: ['.', ...(RUN ? [RUN] : [])] } },
  build: { target: 'esnext', assetsInlineLimit: 0 },
});
