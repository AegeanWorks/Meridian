import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  browserCommand,
  looksLikeMeridian,
  safePath,
  startServer,
} from "../scripts/serve.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("only public entries resolve inside the project", () => {
  assert.ok(safePath("/", root).endsWith("index.html"));
  assert.ok(safePath("/src/core/time.js", root).endsWith("time.js"));
  assert.ok(safePath("/assets/logo.svg", root).endsWith("logo.svg"));
  assert.equal(safePath("/package.json", root), null);
  assert.equal(safePath("/README.md", root), null);
  assert.equal(safePath("/.aikit/project.json", root), null);
});

test("path traversal attempts are refused", () => {
  assert.equal(safePath("/../secret.txt", root), null);
  assert.equal(safePath("/src/../../secret.txt", root), null);
  assert.equal(safePath("/%2e%2e/secret.txt", root), null);
  assert.equal(safePath("/src/%2e%2e/%2e%2e/package.json", root), null);
  assert.equal(safePath("/src/\u0000file", root), null);
  assert.equal(safePath("/%E0%A4%A", root), null);
});

test("the page marker and browser commands are platform-correct", () => {
  assert.equal(looksLikeMeridian("<title>Meridian — a planner</title>"), true);
  assert.equal(looksLikeMeridian("<title>Something else</title>"), false);
  assert.equal(looksLikeMeridian(null), false);
  assert.deepEqual(browserCommand("win32", "http://127.0.0.1:1/"), {
    command: "cmd",
    args: ["/c", "start", "", "http://127.0.0.1:1/"],
  });
  assert.deepEqual(browserCommand("darwin", "u"), { command: "open", args: ["u"] });
  assert.deepEqual(browserCommand("linux", "u"), { command: "xdg-open", args: ["u"] });
});

test("the local server serves the page and refuses everything else", async () => {
  const { server, url } = await startServer({ port: 0 });
  try {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type") ?? "", /text\/html/);
    const body = await page.text();
    assert.match(body, /<title>Meridian/);

    const script = await fetch(`${url}src/core/time.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type") ?? "", /text\/javascript/);

    const privateFile = await fetch(`${url}package.json`);
    assert.equal(privateFile.status, 404);

    const traversal = await fetch(`${url}%2e%2e%2fpackage.json`);
    assert.equal(traversal.status, 404);

    const missing = await fetch(`${url}src/nope.js`);
    assert.equal(missing.status, 404);

    const post = await fetch(url, { method: "POST" });
    assert.equal(post.status, 405);
  } finally {
    await new Promise((done) => server.close(done));
  }
});
