import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_PORT = 4179;
const TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".ics": "text/calendar; charset=utf-8",
  ".ico": "image/x-icon",
});

const PUBLIC_ENTRIES = Object.freeze(["LICENSE", "assets", "index.html", "src"]);

export function browserCommand(platform, url) {
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }
  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }
  return { command: "xdg-open", args: [url] };
}

export function looksLikeMeridian(body) {
  return typeof body === "string" && body.includes("<title>Meridian");
}

export function safePath(urlPath = "/", baseDir = root) {
  const base = resolve(baseDir);
  let clean;
  try {
    clean = decodeURIComponent(String(urlPath).split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  if (clean.includes("\0")) return null;
  const relative =
    clean === "/" || clean === ""
      ? "index.html"
      : clean.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  const candidate = normalize(join(base, relative));
  if (candidate !== base && !candidate.startsWith(`${base}${sep}`)) return null;
  const entry = relative.split("/")[0];
  if (!PUBLIC_ENTRIES.some((allowed) => allowed === entry)) return null;
  return candidate;
}

async function respond(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function handle(rootDir) {
  return async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      await respond(response, 405, "Method not allowed\n");
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const filePath = safePath(url.pathname, rootDir);
    if (!filePath) {
      await respond(response, 404, "Not found\n");
      return;
    }
    try {
      const info = await stat(filePath);
      if (!info.isFile()) {
        await respond(response, 404, "Not found\n");
        return;
      }
      const body = await readFile(filePath);
      const type =
        basename(filePath).toLowerCase() === "license"
          ? "text/plain; charset=utf-8"
          : TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
      response.writeHead(200, {
        "content-type": type,
        "content-length": body.length,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      await respond(response, 404, "Not found\n");
    }
  };
}

export function startServer({ port = DEFAULT_PORT, host = "127.0.0.1", rootDir = root } = {}) {
  return new Promise((resolveServer, rejectServer) => {
    const server = createServer(handle(rootDir));
    server.once("error", rejectServer);
    server.listen(port, host, () => {
      const address = server.address();
      const boundPort = typeof address === "object" && address ? address.port : port;
      resolveServer({ server, port: boundPort, url: `http://${host}:${boundPort}/` });
    });
  });
}

export function openBrowser(url, platform = process.platform) {
  const { command, args } = browserCommand(platform, url);
  const child = spawn(command, args, { stdio: "ignore", detached: true, windowsHide: true });
  child.on("error", () => {});
  child.unref();
}

async function main() {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf("--port");
  const port = portIndex >= 0 ? Number(args[portIndex + 1]) : DEFAULT_PORT;
  const { url } = await startServer({ port });
  console.log(`Meridian is running at ${url}`);
  console.log("Press Ctrl+C to stop.");
  if (args.includes("--open")) openBrowser(url);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[FAIL] ${error.message}`);
    process.exitCode = 1;
  });
}
