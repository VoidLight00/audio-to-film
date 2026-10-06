#!/usr/bin/env bun
// Offline renderer. Drives the app in headless Chrome (?export=1) and either
//   timeline: bun scripts/render.ts timeline [--out <run>/timeline.json]   (the resolved edit, for src/plan_gate.py)
//   stills:  bun scripts/render.ts stills --t 1.5,23,40.2 [--only id1,id2] [--out dir]
//   sheet:   bun scripts/render.ts sheet --from 20 --to 35 [--n 12] [--cols 4] [--only ids] [--out file.png]   (or --times a,b,c | --cuts)
//   perf:    bun scripts/render.ts perf --from 20 --to 25 [--only ids] [--samples 1] [--shutter 0.5]   (avg ms per frame incl. GPU sync and the export's pixel readback)
//   video:   bun scripts/render.ts video [--from 0] [--to <duration>] [--fps 60] [--crf 16] [--x264 aq-mode=3] [--samples 1] [--shutter 0.5] [--segment 15] [--out <run>/film.mp4] [--noaudio]
//            renders --segment-second video-only segments into <out>.segments/, skips segments already complete
//            (ffprobe frame count), retries a crashed segment in a fresh browser, then concatenates them losslessly
//            (ffmpeg -f concat -c copy) and muxes the run's input.wav. Re-running the same command resumes.
//            --claim: run the same command N times at once; the workers share <out>.segments/ as a queue (byte-identical output)
//            --samples N averages N sub-frames per frame over shutter×(1/fps): motion blur + temporal AA;
//            --samples auto picks the count per frame (4, 12, 36, 108 or 324, see Engine.render)
//   --scale N (all modes): render at N× the 1920x1080 layout (--scale 2 = true 3840x2160); stills are then saved
//            full-res from the pixel buffer, videos are encoded at the physical size.
// Needs ATF_RUN=<run dir> (audio.json, lyrics.json, input.wav). Starts a private Vite server for that run unless --url is given.
// Adapted from mexicat/pdoom-video app/scripts/render.ts (MIT, see LICENSE.pdoom-video).
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, existsSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'stills';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const APP = path.resolve(import.meta.dir, '..');
const SCALE = Math.max(1, Math.round(+opt('scale', '1')!));
const OW = 1920 * SCALE, OH = 1080 * SCALE; // output size
// --samples N (fixed) or --samples auto [--min-samples 4] [--max-samples 324] [--tol 3] (adaptive, see Engine.render)
const SAMPLES = opt('samples', '1') === 'auto'
  ? { min: +opt('min-samples', '4')!, max: +opt('max-samples', '324')!, tol: +opt('tol', '3')! }
  : +opt('samples', '1')!;
const hist = (h: Record<string, number>) => Object.entries(h).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => `${k}:${v}`).join(' ');
if (!process.env.ATF_RUN) { console.error('ATF_RUN=<run dir> is required'); process.exit(2); }
const RUN = path.resolve(process.env.ATF_RUN);
const AUDIO = path.join(RUN, 'input.wav');

async function reachable(url: string) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

async function ensureServer(): Promise<{ url: string; stop: () => void }> {
  // an already running server may be serving another run: only reuse one when asked to
  const url = opt('url');
  if (url) { if (await reachable(url)) return { url, stop: () => {} }; throw new Error(`--url ${url} unreachable`); }
  const port = 5300 + Math.floor(Math.random() * 500);
  // no live reload: a file saved mid-render must not reload the page
  const proc = Bun.spawn(['bunx', 'vite', '--port', String(port), '--strictPort'], { cwd: APP, stdout: 'ignore', stderr: 'ignore', env: { ...process.env, ATF_RUN: RUN, ATF_NO_HMR: '1' } });
  const u = `http://localhost:${port}`;
  for (let i = 0; i < 100 && !(await reachable(u)); i++) await Bun.sleep(100);
  return { url: u, stop: () => proc.kill() };
}

async function openPage(url: string) {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !flag('headed'),
    args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const only = opt('only');
  await page.goto(`${url}/?export=1${only ? `&only=${only}` : ''}${SCALE !== 1 ? `&scale=${SCALE}` : ''}${flag('no-grain') ? '&nograin=1' : ''}`);
  await page.waitForFunction(() => (window as any).__film?.ready || (window as any).__film?.error, null, { timeout: 120000 });
  const err = await page.evaluate(() => (window as any).__film.error);
  if (err) throw new Error(`app failed to boot:\n${err}\n${logs.join('\n')}`);
  const size: [number, number] = await page.evaluate(() => [(window as any).__film.width ?? 1920, (window as any).__film.height ?? 1080]);
  if (size[0] !== OW || size[1] !== OH) throw new Error(`app renders ${size[0]}x${size[1]}, expected ${OW}x${OH} (--scale ${SCALE})`);
  const sceneErrors: string[] = await page.evaluate(() => (window as any).__film.errors);
  const song: string | null = await page.evaluate(() => (window as any).__film.song ?? null);
  // an authored song must not ship a plate that failed to load (it would render black) or an inverted anchor
  if (sceneErrors.length && song) throw new Error(`song ${song}: scene errors:\n${sceneErrors.join('\n')}`);
  if (sceneErrors.length) console.error('SCENE ERRORS:\n' + sceneErrors.join('\n'));
  const anchors: string[] = await page.evaluate(() => (window as any).__film.anchorIssues ?? []);
  if (anchors.length) throw new Error(`inverted anchor spans (gate E5):\n${anchors.join('\n')}`);
  const missing: string[] = await page.evaluate(() => (window as any).__film.missingGlyphs ?? []);
  if (missing.length) throw new Error(`lyrics contain glyphs no bundled font can draw: ${missing.join(' ')}`);
  return { browser, page, logs };
}

async function stills(page: Page, times: number[], outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  for (const t of times) {
    const k: number = await page.evaluate(([t, s, sh]) => (window as any).__film.still(t, s, sh), [t, SAMPLES, +opt('shutter', '0.5')!] as const);
    const f = path.join(outDir, `f_${t.toFixed(2).padStart(7, '0')}.png`);
    if (typeof SAMPLES !== 'number') console.log(`t=${t}: ${k} sub-frames`);
    // at scale > 1 the canvas is shown downscaled on the page: save the full-res pixel buffer instead
    if (SCALE !== 1) await Bun.write(f, Buffer.from(await page.evaluate(() => (window as any).__film.png()), 'base64'));
    else await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    files.push(f);
  }
  return files;
}

async function sheet(page: Page, times: number[], cols: number, out: string) {
  const dataUrl: string = await page.evaluate(async ({ times, cols }) => {
    const P = (window as any).__film;
    const cw = 480, ch = 270, pad = 4, lab = 18;
    const rows = Math.ceil(times.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * (cw + pad) + pad; cv.height = rows * (ch + lab + pad) + pad;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#222'; c.fillRect(0, 0, cv.width, cv.height);
    const src = document.getElementById('c') as HTMLCanvasElement;
    times.forEach((t: number, i: number) => {
      P.still(t);
      const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      c.drawImage(src, x, y + lab, cw, ch);
      c.fillStyle = '#ddd'; c.font = '13px monospace'; c.fillText(`${t.toFixed(2)}s`, x + 2, y + 13);
    });
    return cv.toDataURL('image/png');
  }, { times, cols });
  mkdirSync(path.dirname(out), { recursive: true });
  await Bun.write(out, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
}

/** Frames in a finished segment (0 when missing or unreadable). */
function frameCount(f: string) {
  if (!existsSync(f)) return 0;
  const p = Bun.spawnSync(['ffprobe', '-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', f]);
  return p.exitCode === 0 ? parseInt(p.stdout.toString().trim(), 10) || 0 : 0;
}

/** Frames [n0, n1) from the page into one video-only segment. Written to .part, renamed on success. */
async function encodeSegment(page: Page, n0: number, n1: number, fps: number, out: string) {
  const part = out.replace(/\.mp4$/, '.part.mp4');
  // 4K: a shorter x264 lookahead keeps ffmpeg's memory down (pdoom README)
  const x264 = opt('x264', SCALE > 1 ? 'aq-mode=3:rc-lookahead=30' : 'aq-mode=3')!;
  // Frames are sRGB (toSRGB in the final pass): convert with the BT.709 matrix and tag the stream,
  // otherwise ffmpeg converts with BT.601 while players and YouTube decode untagged HD as BT.709.
  const args = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${OW}x${OH}`, '-r', String(fps), '-i', 'pipe:0',
    '-vf', 'vflip,scale=out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=bt709', '-c:v', 'libx264', '-preset', opt('preset', 'slow')!,
    '-crf', opt('crf', '16')!, '-pix_fmt', 'yuv420p', '-tune', 'grain', '-x264-params', x264, '-an', part];
  const ff = Bun.spawn(args, { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' });
  let frames = 0;
  const total = n1 - n0, t0 = performance.now();
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) { return srv.upgrade(req) ? undefined : new Response('ws only', { status: 400 }); },
    websocket: {
      maxPayloadLength: Math.max(64 * 1024 * 1024, OW * OH * 4 + 1024),
      async message(ws, msg) {
        ff.stdin.write(msg as Uint8Array);
        await ff.stdin.flush();
        frames++;
        ws.send(String(frames)); // ack: the page keeps at most `inflight` frames ahead of ffmpeg (bounded memory at 4K)
        if (frames % 60 === 0 || frames === total) {
          const el = (performance.now() - t0) / 1000;
          process.stdout.write(`\r  ${frames}/${total} frames  ${(frames / el).toFixed(2)} fps  eta ${((total - frames) / (frames / el)).toFixed(0)}s   `);
        }
      },
    },
  });
  try {
    const used: Record<string, number> = await page.evaluate((o) => (window as any).__film.stream(o),
      { from: n0 / fps, to: n1 / fps, fps, ws: `ws://localhost:${server.port}`, samples: SAMPLES, shutter: +opt('shutter', '0.5')!, inflight: 4 });
    while (frames < total) await Bun.sleep(20);
    ff.stdin.end();
    if ((await ff.exited) !== 0) throw new Error(`ffmpeg exited ${ff.exitCode} on ${part}`);
    if (frameCount(part) !== total) throw new Error(`${part}: ${frameCount(part)} frames, expected ${total}`);
    renameSync(part, out);
    return used;
  } catch (e) {
    try { ff.stdin.end(); } catch { /* already closed */ }
    ff.kill();
    throw e;
  } finally {
    server.stop(true);
  }
}

async function video(session: Session, from: number, to: number, fps: number, out: string) {
  mkdirSync(path.dirname(out), { recursive: true });
  const segDir = `${out}.segments`;
  mkdirSync(segDir, { recursive: true });
  const N0 = Math.round(from * fps), N1 = Math.round(to * fps);
  const step = Math.max(1, Math.round(+opt('segment', '15')! * fps));
  const segs: { n0: number; n1: number; file: string }[] = [];
  for (let n = N0; n < N1; n += step) {
    const n1 = Math.min(N1, n + step);
    segs.push({ n0: n, n1, file: path.join(segDir, `seg_${String(n).padStart(7, '0')}_${String(n1).padStart(7, '0')}.mp4`) });
  }
  const used: Record<string, number> = {};
  const t0 = performance.now();
  // --claim: several workers share <out>.segments/ as a work queue; an atomic mkdir hands each segment to one
  // worker, and whichever worker finds every segment complete concatenates. A lock left by a killed worker
  // blocks that segment: re-run without --claim to finish it.
  const claim = flag('claim');
  for (const [i, sg] of segs.entries()) {
    if (frameCount(sg.file) === sg.n1 - sg.n0) { console.log(`segment ${i + 1}/${segs.length} complete, skipped`); continue; }
    if (claim) {
      try { mkdirSync(`${sg.file}.lock`); } catch { console.log(`segment ${i + 1}/${segs.length} claimed by another worker`); continue; }
    }
    try {
    for (let attempt = 1; ; attempt++) {
      try {
        console.log(`segment ${i + 1}/${segs.length}: frames ${sg.n0}-${sg.n1}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
        if (!session.page) Object.assign(session, await openPage(session.url));
        const u = await encodeSegment(session.page!, sg.n0, sg.n1, fps, sg.file);
        for (const [k, v] of Object.entries(u)) used[k] = (used[k] ?? 0) + v;
        process.stdout.write('\n');
        break;
      } catch (e) {
        console.error(`\nsegment ${i + 1} failed: ${(e as Error).message}`);
        // a crashed or wedged page is not reused: the next attempt boots a fresh browser
        await session.browser?.close().catch(() => {});
        session.browser = undefined; session.page = undefined;
        if (attempt >= 3) throw new Error(`segment ${sg.file} failed 3 times; re-run the same command to resume`);
      }
    }
    } finally {
      if (claim) rmSync(`${sg.file}.lock`, { recursive: true, force: true });
    }
  }
  if (claim) {
    if (segs.some((s) => frameCount(s.file) !== s.n1 - s.n0)) { console.log('other workers are still rendering; the last one concatenates'); return; }
    try { mkdirSync(path.join(segDir, 'concat.lock')); } catch { return; }
  }
  const list = path.join(segDir, 'concat.txt');
  writeFileSync(list, segs.map((s) => `file '${path.basename(s.file)}'`).join('\n') + '\n');
  const mux = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
  if (!flag('noaudio')) mux.push('-ss', String(from), '-t', String(to - from), '-i', AUDIO, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k');
  // the timeline runs to the end of the audio file: -t, not -shortest, so a reverb tail is never cut
  mux.push('-c:v', 'copy', '-t', String(to - from), '-movflags', '+faststart', out);
  const m = Bun.spawnSync(mux, { stdout: 'inherit', stderr: 'inherit' });
  if (m.exitCode !== 0) throw new Error(`concat/mux failed (exit ${m.exitCode})`);
  const got = frameCount(out);
  if (got !== N1 - N0) throw new Error(`${out}: ${got} frames, expected ${N1 - N0}`);
  if (!flag('keep-segments')) rmSync(segDir, { recursive: true, force: true });
  // what this file covers, for src/film_qa.py (a partial render is checked against its own span)
  writeFileSync(`${out}.span.json`, JSON.stringify({ from, to, fps, scale: SCALE, samples: SAMPLES, frames: got }));
  console.log(`wrote ${out} (${got} frames, ${((performance.now() - t0) / 1000).toFixed(1)}s this run)`);
  console.log(`sub-frames per frame (count:frames, rendered this run): ${hist(used)}`);
}

type Session = { url: string; browser?: Awaited<ReturnType<typeof openPage>>['browser']; page?: Page; logs?: string[] };

const { url, stop } = await ensureServer();
const session: Session = { url, ...(await openPage(url)) };
const page = session.page!;
try {
  if (mode === 'gpu') {
    console.log(await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }));
  } else if (mode === 'timeline') {
    // the resolved edit (plate windows computed from lyrics + beat grid) for src/plan_gate.py
    const tl = await page.evaluate(() => ({ song: (window as any).__film.song, duration: (window as any).__film.duration,
      entries: (window as any).__film.timeline.map((e: any) => ({ id: e.id, start: e.start, end: e.end, params: e.params ?? {} })) }));
    const out = opt('out', path.join(RUN, 'timeline.json'))!;
    writeFileSync(out, JSON.stringify(tl, null, 1));
    console.log(out);
  } else if (mode === 'stills') {
    const times = (opt('t') ?? '0').split(',').map(Number);
    const files = await stills(page, times, opt('out', path.join(RUN, 'stills'))!);
    console.log(files.join('\n'));
  } else if (mode === 'sheet') {
    const from = +opt('from', '0')!, to = +opt('to', '10')!, n = +opt('n', '12')!;
    let times = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
    if (opt('times')) times = opt('times')!.split(',').map(Number);
    if (flag('cuts')) {
      // 4 frames around every timeline boundary: 2 frames before, 2 after
      const tl: { id: string; start: number }[] = await page.evaluate(() => (window as any).__film.timeline);
      times = tl.slice(1).flatMap((e) => [e.start - 0.1, e.start - 1 / 60, e.start + 1 / 60, e.start + 0.1]);
    }
    const out = opt('out', path.join(RUN, `sheets/sheet_${from}-${to}.png`))!;
    await sheet(page, times, +opt('cols', '4')!, out);
    console.log(out);
  } else if (mode === 'perf') {
    const from = +opt('from', '0')!, to = +opt('to', '5')!;
    const r = await page.evaluate(async ({ from, to, samples, shutter }) => {
      const P = (window as any).__film;
      const ms: number[] = [];
      const buf = new Uint8Array(P.width * P.height * 4);
      P.still(from);
      const used: Record<number, number> = {};
      for (let t = from; t < to; t += 1 / 60) {
        const a = performance.now();
        const k = P.engine.render(t, 1 / 60, false, samples, shutter);
        used[k] = (used[k] ?? 0) + 1;
        await P.engine.readPixelsAsync(buf);
        ms.push(performance.now() - a);
      }
      ms.sort((a, b) => a - b);
      return { n: ms.length, avg: ms.reduce((a, b) => a + b, 0) / ms.length, p50: ms[ms.length >> 1], p95: ms[Math.floor(ms.length * 0.95)], max: ms[ms.length - 1], used };
    }, { from, to, samples: SAMPLES, shutter: +opt('shutter', '0.5')! });
    console.log(`frames ${r.n}  avg ${r.avg.toFixed(1)}ms  p50 ${r.p50.toFixed(1)}  p95 ${r.p95.toFixed(1)}  max ${r.max.toFixed(1)}  sub-frames ${hist(r.used)}`);
  } else if (mode === 'video') {
    const dur: number = await page.evaluate(() => (window as any).__film.duration);
    await video(session, +opt('from', '0')!, +opt('to', String(dur))!, +opt('fps', '60')!, path.resolve(opt('out', path.join(RUN, 'film.mp4'))!));
  }
  // spans built lazily inside render() are recorded too: fail at the end rather than ship them
  const late: string[] = await (session.page ?? page).evaluate(() => (window as any).__film?.anchorIssues ?? []).catch(() => []);
  if (late.length) throw new Error(`inverted anchor spans (gate E5):\n${late.join('\n')}`);
  if (session.logs?.length) console.error('BROWSER LOG:\n' + session.logs.slice(0, 40).join('\n'));
} finally {
  await session.browser?.close().catch(() => {});
  stop();
}
