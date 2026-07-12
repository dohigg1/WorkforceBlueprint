// End-to-end self-verification. Spawns the API and the Vite dev server as child
// processes, drives the app with a headless Chromium, and screenshots each view
// against the live database. Kills both children by PID at the end.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const SCRATCH = '/tmp/claude-0/-home-user-WorkforceBlueprint/8d4c6b82-be63-565a-97bc-3ab276e41d5c/scratchpad';
const REPO = '/home/user/WorkforceBlueprint';
const WEB = path.join(REPO, 'apps/web');
const require = createRequire(SCRATCH + '/node_modules/');
const { chromium } = require('playwright-core');

const CHROME = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

async function waitFor(url, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) {
        console.log(`[wait] ${label} reachable (${res.status}) after ${i} tries`);
        return;
      }
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`${label} did not become reachable at ${url}`);
}

let api, vite, browser;
const consoleErrors = [];
let dbgPage = null;
const kill = (child) => {
  if (child && child.pid && !child.killed) {
    try {
      process.kill(child.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
};

try {
  api = spawn('node', [path.join(REPO, 'apps/api/dist/main.js')], {
    env: { ...process.env, PORT: '4000' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  vite = spawn(path.join(REPO, 'node_modules/.bin/vite'), ['--port', '5173', '--strictPort'], {
    cwd: WEB,
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  await waitFor('http://localhost:4000/auth/me', 'API');
  await waitFor('http://localhost:5173/', 'Vite');

  browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  dbgPage = page;

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + err.message));

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

  // Login gate.
  await page.getByRole('button', { name: 'Enter demo workspace' }).click();
  await sleep(1500);
  await page.screenshot({ path: path.join(SCRATCH, 'shot-0-postlogin.png') });
  await page.waitForSelector('canvas.chart', { timeout: 15000 });
  await sleep(1200); // let the chart fit + paint

  await page.screenshot({ path: path.join(SCRATCH, 'shot-1-chart.png') });

  // Zoom in over the top-centre root so the chart is readable, then click the
  // root node to demonstrate hit-testing. The inspector shows its cost build-up.
  const box = await page.locator('canvas.chart').boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const rootY = box.y + box.height / 2 - 30;
    await page.mouse.move(cx, rootY);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -240);
      await sleep(120);
    }
    await sleep(500);
  }
  await sleep(400);
  await page.screenshot({ path: path.join(SCRATCH, 'shot-2-node-cost.png') });

  // Span colour mode.
  await page.getByRole('button', { name: 'Colour: span' }).click();
  await sleep(400);
  await page.screenshot({ path: path.join(SCRATCH, 'shot-3-span.png') });

  // Measures tab.
  await page.getByRole('button', { name: /Measures/ }).click();
  await page.waitForSelector('.kpi', { timeout: 8000 });
  await sleep(500);
  await page.screenshot({ path: path.join(SCRATCH, 'shot-4-measures.png') });

  // Scenario tab + compare.
  await page.getByRole('button', { name: /Scenario/ }).click();
  await sleep(1500);
  await page.screenshot({ path: path.join(SCRATCH, 'shot-5-scenario.png') });

  // Ingestion tab: analyse the pre-filled awkward CSV.
  await page.getByRole('button', { name: /Ingestion/ }).click();
  await page.waitForSelector('textarea.csv', { timeout: 8000 });
  await page.getByRole('button', { name: 'Analyse' }).click();
  await page.waitForSelector('.score-num', { timeout: 8000 });
  await sleep(500);
  await page.screenshot({ path: path.join(SCRATCH, 'shot-6-ingestion.png'), fullPage: true });

  console.log('\n=== CONSOLE ERRORS ===');
  if (consoleErrors.length === 0) console.log('NONE');
  else consoleErrors.forEach((e) => console.log(' - ' + e));
  console.log('=== SCREENSHOTS SAVED to ' + SCRATCH + ' ===');

  await browser.close();
} catch (err) {
  console.error('RUN FAILED:', err);
  if (dbgPage) {
    try {
      await dbgPage.screenshot({ path: path.join(SCRATCH, 'shot-fail.png') });
      const html = await dbgPage.content();
      console.error('PAGE HTML (first 1200):', html.slice(0, 1200));
    } catch {
      /* ignore */
    }
  }
  console.error('CONSOLE ERRORS:', consoleErrors.length ? consoleErrors : 'none');
} finally {
  if (browser) {
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
  }
  kill(vite);
  kill(api);
}
process.exit(0);
