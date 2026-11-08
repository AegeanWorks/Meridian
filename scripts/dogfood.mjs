#!/usr/bin/env node
/**
 * Meridian's browser dogfood pass.
 *
 * Starts the static server, launches an installed Edge/Chrome headlessly,
 * drives the real UI through adding people, dragging a slot, best-slot,
 * keyboard nudging, the share link and the calendar download, and fails on
 * any page exception. It skips cleanly when no Chromium browser is available.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./serve.mjs";

const WINDOWS_BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

const MAC_BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

function findBrowser(platform = process.platform, exists = existsSync) {
  if (platform === "win32") return WINDOWS_BROWSERS.find((path) => exists(path)) ?? null;
  if (platform === "darwin") return MAC_BROWSERS.find((path) => exists(path)) ?? null;
  for (const command of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) {
    const result = spawnSync("which", [command], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  return null;
}

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget(port, url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find((target) => target.type === "page" && target.url.startsWith(url));
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // The debugging endpoint is not listening yet.
    }
    await wait(200);
  }
  throw new Error("the browser did not expose the Meridian page over CDP");
}

async function connect(webSocketUrl) {
  const ws = new WebSocket(webSocketUrl);
  const pending = new Map();
  const errors = [];
  let nextId = 0;
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params?.exceptionDetails;
      errors.push(details?.exception?.description ?? details?.text ?? "Uncaught exception");
    }
    if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
      errors.push(message.params.entry.text);
    }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return {
    ws,
    errors,
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    async evaluate(expression) {
      const result = await this.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      }
      return result.result.value;
    },
  };
}

async function cellCenters(connection, id, fromCol, toCol) {
  return connection.evaluate(`(() => {
    const pick = (col) => document.querySelector('button.cell[data-id="${id}"][data-col="' + col + '"]');
    pick(${fromCol}).scrollIntoView({ block: 'center', inline: 'center' });
    const center = (node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    return { from: center(pick(${fromCol})), to: center(pick(${toCol})) };
  })()`);
}

async function mouse(connection, type, point, buttons) {
  await connection.send("Input.dispatchMouseEvent", {
    type,
    x: point.x,
    y: point.y,
    button: "left",
    buttons,
    clickCount: 1,
  });
}

async function drag(connection, from, to) {
  await mouse(connection, "mousePressed", from, 1);
  for (let step = 1; step <= 5; step += 1) {
    await mouse(
      connection,
      "mouseMoved",
      { x: from.x + ((to.x - from.x) * step) / 5, y: from.y + ((to.y - from.y) * step) / 5 },
      1,
    );
    await wait(30);
  }
  await mouse(connection, "mouseReleased", to, 0);
  await wait(200);
}

async function addPerson(connection, label, zone, start = 9, end = 17) {
  await connection.evaluate(`(() => {
    const label = document.getElementById('participant-label');
    const zone = document.getElementById('participant-zone');
    label.value = ${JSON.stringify(label)};
    zone.value = ${JSON.stringify(zone)};
    document.getElementById('participant-start').value = '${start}';
    document.getElementById('participant-end').value = '${end}';
    document.getElementById('participant-add').click();
  })()`);
  await wait(250);
}

async function main() {
  if (typeof WebSocket !== "function") {
    console.log("[SKIP] Meridian dogfood needs Node.js 22+ with a global WebSocket client.");
    return 0;
  }
  const browser = findBrowser();
  if (!browser) {
    console.log("[SKIP] No Edge/Chrome found; install one to run the browser dogfood pass.");
    return 0;
  }

  const { server, url } = await startServer({ port: 0 });
  const debuggingPort = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "meridian-dogfood-"));
  const downloads = mkdtempSync(join(tmpdir(), "meridian-downloads-"));
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${debuggingPort}`,
      url,
    ],
    { stdio: "ignore", windowsHide: true },
  );

  let connection = null;
  try {
    const target = await waitForTarget(debuggingPort, url);
    connection = await connect(target.webSocketDebuggerUrl);
    await connection.send("Page.enable");
    await connection.send("Runtime.enable");
    await connection.send("Log.enable");
    try {
      await connection.send("Emulation.setDeviceMetricsOverride", {
        width: 1440,
        height: 960,
        deviceScaleFactor: 1,
        mobile: false,
      });
    } catch {
      // Older browsers ignore the override; coordinates are scrolled into view anyway.
    }
    try {
      await connection.send("Browser.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: downloads,
        eventsEnabled: true,
      });
    } catch {
      await connection.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
    }
    await wait(1200);

    const initial = await connection.evaluate(`(() => {
      const app = globalThis.meridian;
      return {
        ready: Boolean(app),
        participants: app?.plan?.participants?.length ?? 0,
        rows: document.querySelectorAll('.participant-row').length,
        cells: document.querySelectorAll('button.cell').length,
        nowLine: Boolean(document.querySelector('.now-line')) && !document.querySelector('.now-line').hidden,
        heading: document.getElementById('date-heading').textContent,
        machines: Boolean(app?.machines?.['plan-version']),
        hashStatus: app?.hashStatus ?? null,
        duration: app?.duration ?? null,
      };
    })()`);
    if (!initial.ready || initial.participants !== 2 || initial.rows !== 2 || initial.cells !== 48) {
      throw new Error(`the default plan did not mount: ${JSON.stringify(initial)}`);
    }
    if (!initial.nowLine || !initial.heading.trim()) {
      throw new Error(`the today marker or date heading is missing: ${JSON.stringify(initial)}`);
    }
    if (!initial.machines || initial.hashStatus !== 'valid' || initial.duration !== 1) {
      throw new Error(`the AX surface is incomplete: ${JSON.stringify(initial)}`);
    }

    const malformedHash = await connection.evaluate(`(() => {
      const before = globalThis.meridian.plan.date;
      const good = location.hash;
      history.replaceState(null, '', '#p=not-json');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      const result = {
        before,
        date: globalThis.meridian.plan.date,
        message: document.getElementById('status').textContent,
        tone: document.getElementById('status').dataset.tone ?? '',
      };
      history.replaceState(null, '', good);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return result;
    })()`);
    if (
      malformedHash.date !== malformedHash.before ||
      !/could not be read/i.test(malformedHash.message) ||
      malformedHash.tone !== 'error'
    ) {
      throw new Error(`a malformed share hash was not reported: ${JSON.stringify(malformedHash)}`);
    }

    const invalidDate = await connection.evaluate(`(() => {
      const before = globalThis.meridian.plan.date;
      const result = globalThis.meridian.setDate('2026-02-31');
      return {
        before,
        result,
        date: globalThis.meridian.plan.date,
        input: document.getElementById('date-input').value,
      };
    })()`);
    if (
      invalidDate.result !== false ||
      invalidDate.date !== invalidDate.before ||
      invalidDate.input !== invalidDate.before
    ) {
      throw new Error(`an impossible date was accepted: ${JSON.stringify(invalidDate)}`);
    }

    const badSlot = await connection.evaluate(`(() => {
      globalThis.meridian.setSlot({ start: Number.NaN, hours: 2 });
      return {
        slot: globalThis.meridian.slot,
        summaryHidden: document.getElementById('summary').hidden,
      };
    })()`);
    if (badSlot.slot !== null || !badSlot.summaryHidden) {
      throw new Error(`a non-finite slot was not normalized: ${JSON.stringify(badSlot)}`);
    }

    const zoneForm = await connection.evaluate(`(() => {
      const original = globalThis.meridian.plan.referenceZone;
      const input = document.getElementById('reference-zone');
      input.value = 'europe/istanbul';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const canonical = globalThis.meridian.plan.referenceZone;
      input.value = original;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return { original, canonical, restored: globalThis.meridian.plan.referenceZone };
    })()`);
    if (zoneForm.canonical !== 'Europe/Istanbul' || zoneForm.restored !== zoneForm.original) {
      throw new Error(`a zone was not canonicalized: ${JSON.stringify(zoneForm)}`);
    }

    await addPerson(connection, "Sam", "America/New_York");
    await addPerson(connection, "Mei", "Asia/Tokyo");
    const added = await connection.evaluate(`(() => ({
      participants: globalThis.meridian.plan.participants.map((participant) => participant.label),
      rows: document.querySelectorAll('.participant-row').length,
      cells: document.querySelectorAll('button.cell').length,
      hash: location.hash,
      workWindows: globalThis.meridian.dayPlan.windows.work.length,
      awakeWindows: globalThis.meridian.dayPlan.windows.awake.length,
    }))()`);
    if (added.rows !== 4 || added.cells !== 96) {
      throw new Error(`adding people did not grow the grid: ${JSON.stringify(added)}`);
    }
    if (added.participants.join(",") !== "You,New York,Sam,Mei") {
      throw new Error(`participant order is wrong: ${JSON.stringify(added.participants)}`);
    }
    if (!added.hash.includes("#p=")) throw new Error("the plan was not written to the URL hash");
    if (added.workWindows + added.awakeWindows === 0) {
      throw new Error("no candidate window exists for a three-zone team");
    }

    const firstId = await connection.evaluate(
      "document.querySelector('.participant-row').dataset.id",
    );
    const centers = await cellCenters(connection, firstId, 10, 12);
    await drag(connection, centers.from, centers.to);
    const dragged = await connection.evaluate(`(() => ({
      slot: globalThis.meridian.slot,
      selected: document.querySelectorAll('button.cell.sel').length,
      summaryHidden: document.getElementById('summary').hidden,
      title: document.getElementById('summary-title').textContent,
      lines: document.querySelectorAll('#summary-lines li').length,
      badge: document.getElementById('summary-badge').textContent,
      duration: document.getElementById('duration').value,
      durationState: globalThis.meridian.duration,
      icsEnabled: !document.getElementById('download-ics').disabled,
    }))()`);
    if (!dragged.slot || dragged.slot.start !== 10 || dragged.slot.hours !== 3) {
      throw new Error(`dragging did not select a three-hour slot: ${JSON.stringify(dragged.slot)}`);
    }
    if (dragged.duration !== '3' || dragged.durationState !== 3) {
      throw new Error(`the length selector did not follow the slot: ${JSON.stringify(dragged)}`);
    }
    if (dragged.selected !== 3 * 4) {
      throw new Error(`the selection was not painted on every row: ${dragged.selected}`);
    }
    if (dragged.summaryHidden || dragged.lines !== 4 || !dragged.badge) {
      throw new Error(`the summary card is incomplete: ${JSON.stringify(dragged)}`);
    }
    if (!dragged.icsEnabled || !dragged.title.includes("·")) {
      throw new Error(`the calendar action was not enabled: ${JSON.stringify(dragged)}`);
    }

    const beforeKey = dragged.slot.start;
    await connection.evaluate(`(() => {
      const node = document.querySelector('button.cell.sel');
      node.focus();
      node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    })()`);
    await wait(150);
    const nudged = await connection.evaluate("globalThis.meridian.slot.start");
    if (nudged !== beforeKey + 1) {
      throw new Error(`ArrowRight did not nudge the slot: ${beforeKey} -> ${nudged}`);
    }

    await connection.evaluate("document.getElementById('best-slot').click()");
    await wait(200);
    const best = await connection.evaluate(`(() => {
      const slot = globalThis.meridian.slot;
      const data = globalThis.meridian.slotData;
      return { slot, level: data?.quality?.level ?? null, lines: data?.rows?.length ?? 0 };
    })()`);
    if (!best.slot || best.lines !== 4 || !["work", "awake", "mixed"].includes(best.level)) {
      throw new Error(`best slot did not produce a scored slot: ${JSON.stringify(best)}`);
    }

    await connection.evaluate("document.getElementById('copy-link').click()");
    await wait(150);
    const hash = await connection.evaluate("location.hash");
    if (!hash.startsWith("#p=") || hash.length < 30) {
      throw new Error(`the share link hash is malformed: ${hash}`);
    }

    await connection.evaluate("document.getElementById('download-ics').click()");
    let saved = null;
    for (let attempt = 0; attempt < 25 && !saved; attempt += 1) {
      await wait(200);
      saved = readdirSync(downloads).find((name) => name.endsWith(".ics")) ?? null;
    }
    if (!saved) throw new Error("the calendar file was not downloaded");
    const calendar = readFileSync(join(downloads, saved), "utf8");
    if (!calendar.startsWith("BEGIN:VCALENDAR") || !calendar.includes("DTSTART:") || !calendar.includes("DTEND:")) {
      throw new Error("the downloaded calendar is missing its event");
    }
    if (!/SUMMARY:.+/u.test(calendar)) throw new Error("the downloaded calendar has no summary");

    const cancelCenters = await cellCenters(connection, firstId, 14, 18);
    const cancelledDrag = await connection.evaluate(`(() => {
      const first = document.querySelector('button.cell[data-id="${firstId}"][data-col="14"]');
      first.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: ${Math.round(cancelCenters.from.x)}, clientY: ${Math.round(cancelCenters.from.y)} }));
      const afterDown = globalThis.meridian.slot;
      window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
      const target = document.querySelector('button.cell[data-id="${firstId}"][data-col="18"]');
      target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: ${Math.round(cancelCenters.to.x)}, clientY: ${Math.round(cancelCenters.to.y)} }));
      return { afterDown, afterMove: globalThis.meridian.slot };
    })()`);
    if (
      !cancelledDrag.afterDown ||
      cancelledDrag.afterMove.start !== cancelledDrag.afterDown.start ||
      cancelledDrag.afterMove.hours !== cancelledDrag.afterDown.hours
    ) {
      throw new Error(`a cancelled drag kept resizing: ${JSON.stringify(cancelledDrag)}`);
    }

    await connection.evaluate(`(() => {
      const row = document.querySelectorAll('.participant')[2];
      row.querySelector('.p-remove').click();
    })()`);
    await wait(250);
    const removed = await connection.evaluate(`(() => ({
      participants: globalThis.meridian.plan.participants.length,
      rows: document.querySelectorAll('.participant-row').length,
      labels: globalThis.meridian.plan.participants.map((participant) => participant.label),
    }))()`);
    if (removed.participants !== 3 || removed.rows !== 3) {
      throw new Error(`removing a person did not shrink the grid: ${JSON.stringify(removed)}`);
    }

    await connection.evaluate(`(() => {
      const zone = document.getElementById('reference-zone');
      zone.value = 'Pacific/Auckland';
      zone.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await wait(250);
    const rezoned = await connection.evaluate(`(() => ({
      referenceZone: globalThis.meridian.plan.referenceZone,
      cells: document.querySelectorAll('button.cell').length,
      hash: location.hash,
    }))()`);
    if (rezoned.referenceZone !== "Pacific/Auckland" || rezoned.cells !== 72 || !rezoned.hash.includes("Auckland")) {
      throw new Error(`the reference zone did not apply: ${JSON.stringify(rezoned)}`);
    }

    await connection.evaluate("document.getElementById('date-next').click()");
    await wait(200);
    const nextDay = await connection.evaluate(`(() => ({
      date: globalThis.meridian.plan.date,
      heading: document.getElementById('date-heading').textContent,
      input: document.getElementById('date-input').value,
    }))()`);
    if (nextDay.date !== nextDay.input || !nextDay.heading.trim()) {
      throw new Error(`the date stepper is out of sync: ${JSON.stringify(nextDay)}`);
    }

    const randomPlan = await connection.evaluate(`(() => {
      history.replaceState(null, '', '#p=' + encodeURIComponent(JSON.stringify({
        v: 1, d: '2026-12-24', r: 'Europe/Istanbul',
        p: [['Ada', 'Europe/Istanbul', 8, 16], ['Noa', 'America/Chicago', 9, 17]],
      })));
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return {
        date: globalThis.meridian.plan.date,
        labels: globalThis.meridian.plan.participants.map((participant) => participant.label),
        rows: document.querySelectorAll('.participant-row').length,
      };
    })()`);
    await wait(200);
    if (randomPlan.date !== "2026-12-24" || randomPlan.rows !== 2) {
      throw new Error(`a pasted share hash was not loaded: ${JSON.stringify(randomPlan)}`);
    }

    await connection.evaluate("document.getElementById('plan-reset').click()");
    await wait(300);
    const reset = await connection.evaluate(`(() => ({
      participants: globalThis.meridian.plan.participants.length,
      labels: globalThis.meridian.plan.participants.map((participant) => participant.label),
      rows: document.querySelectorAll('.participant-row').length,
      cells: document.querySelectorAll('button.cell').length,
      date: globalThis.meridian.plan.date,
      input: document.getElementById('date-input').value,
      slot: globalThis.meridian.slot,
      summaryHidden: document.getElementById('summary').hidden,
      hash: location.hash,
    }))()`);
    if (reset.participants !== 2 || reset.rows !== 2 || reset.cells !== 48) {
      throw new Error(`Reset did not restore the example plan: ${JSON.stringify(reset)}`);
    }
    if (reset.labels[0] !== "You" || reset.date !== reset.input) {
      throw new Error(`Reset left stale plan details: ${JSON.stringify(reset)}`);
    }
    if (reset.slot !== null || !reset.summaryHidden || !reset.hash.includes("#p=")) {
      throw new Error(`Reset did not clear the selected slot: ${JSON.stringify(reset)}`);
    }

    if (connection.errors.length) {
      throw new Error(`the page reported an error: ${connection.errors[0]}`);
    }

    console.log(
      "[OK] Meridian dogfood: default plan, malformed-link feedback, impossible-date refusal, non-finite slot normalisation, lowercase zone canonicalisation, add/remove people, drag selection across rows, cancelled drag, keyboard nudge, best slot, share hash, calendar download, reference zone, date stepper, pasted links and Reset.",
    );
    return 0;
  } catch (error) {
    console.error(`[FAIL] Meridian dogfood: ${error.message}`);
    console.error("Fix: run `npm start`, open the planner, and check the browser console.");
    return 1;
  } finally {
    connection?.ws.close();
    if (process.platform === "win32" && child.pid) {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill("SIGTERM");
    }
    await new Promise((resolveClose) => server.close(resolveClose));
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
      rmSync(downloads, { recursive: true, force: true, maxRetries: 5 });
    } catch {
      // A lingering browser lock is harmless.
    }
  }
}

process.exitCode = await main();
