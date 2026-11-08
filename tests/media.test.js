import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const media = JSON.parse(readFileSync(join(root, ".aikit/media.json"), "utf8"));

function pngSize(relative) {
  const buffer = readFileSync(join(root, relative));
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG", `${relative} is not a PNG`);
  assert.equal(buffer.subarray(12, 16).toString("ascii"), "IHDR", `${relative} has no IHDR`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("every recorded media asset exists and keeps its recorded dimensions", () => {
  const entries = [...Object.values(media.assets), ...(media.screenshots ?? [])];
  for (const entry of entries) {
    assert.ok(existsSync(join(root, entry.path)), `${entry.path} is missing`);
    const size = pngSize(entry.path);
    if (entry.width) assert.equal(size.width, entry.width, `${entry.path} width`);
    if (entry.height) assert.equal(size.height, entry.height, `${entry.path} height`);
  }
});

test("the README image references resolve inside the repository", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const sources = [...readme.matchAll(/src="(assets\/[^"]+)"/g)].map((match) => match[1]);
  assert.ok(sources.length >= 2, "the README should embed the brand and screenshot assets");
  for (const source of sources) {
    assert.ok(existsSync(join(root, source)), `${source} is missing`);
  }
});
