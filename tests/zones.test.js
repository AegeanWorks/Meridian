import test from "node:test";
import assert from "node:assert/strict";

import {
  COMMON_ZONES,
  allTimeZones,
  canonicalZone,
  searchZones,
  zoneLabel,
  zoneRegion,
} from "../src/core/zones.js";

test("the zone catalog is non-empty and includes the curated list", () => {
  const zones = allTimeZones();
  assert.ok(zones.length > 30);
  assert.ok(zones.includes("Europe/Istanbul"));
  assert.ok(zones.includes("America/New_York"));
  for (const zone of COMMON_ZONES) {
    assert.ok(zones.includes(zone), `missing curated zone ${zone}`);
  }
});

test("labels and regions read from the zone identifier", () => {
  assert.equal(zoneLabel("Europe/Istanbul"), "Istanbul");
  assert.equal(zoneLabel("America/Argentina/Buenos_Aires"), "Buenos Aires");
  assert.equal(zoneLabel("UTC"), "UTC");
  assert.equal(zoneLabel("Etc/GMT+3"), "GMT+3");
  assert.equal(zoneRegion("Europe/Istanbul"), "Europe");
  assert.equal(zoneRegion("America/Argentina/Buenos_Aires"), "America");
  assert.equal(zoneRegion("UTC"), "Etc");
});

test("search ranks exact, prefix and substring matches", () => {
  assert.deepEqual(searchZones("europe/istanbul"), ["Europe/Istanbul"]);
  assert.deepEqual(searchZones("istanbul"), ["Europe/Istanbul"]);
  const newMatches = searchZones("new");
  assert.ok(newMatches.includes("America/New_York"));
  assert.ok(newMatches.includes("America/New_Orleans") || newMatches.length >= 1);
  assert.deepEqual(searchZones("zzzz-nothing"), []);
});

test("an empty query lists curated zones first, capped by the limit", () => {
  const listed = searchZones("");
  assert.equal(listed[0], "UTC");
  assert.ok(listed.length <= 80);
  const curated = searchZones("", allTimeZones(), 3);
  assert.deepEqual(curated, ["UTC", "Pacific/Honolulu", "America/Anchorage"]);
});

test("zone identifiers are stored in catalog form", () => {
  assert.equal(canonicalZone("europe/istanbul"), "Europe/Istanbul");
  assert.equal(canonicalZone("  EUROPE/ISTANBUL "), "Europe/Istanbul");
  assert.equal(canonicalZone("Europe/Istanbul"), "Europe/Istanbul");
  assert.equal(canonicalZone("UTC"), "UTC");
  assert.equal(canonicalZone("Bogus/Zone"), null);
  assert.equal(canonicalZone(""), null);
  assert.equal(canonicalZone(null), null);
  assert.equal(canonicalZone(42), null);
});
