import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("the page is self-contained and every local reference resolves", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(references.length >= 4, "the page should reference its icon, style, script and license");
  for (const reference of references) {
    assert.equal(
      /^(?:https?:)?\/\//.test(reference),
      false,
      `${reference} is a third-party URL`,
    );
    if (/^(?:#|mailto:|data:)/.test(reference)) continue;
    const relative = reference.replace(/^\.\//, "").split(/[?#]/)[0];
    assert.ok(existsSync(join(root, relative)), `${reference} is missing`);
  }
});
