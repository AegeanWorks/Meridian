import test from "node:test";
import assert from "node:assert/strict";

import {
  compareDateISO,
  currentZone,
  formatOffset,
  isValidTimeZone,
  localDateISO,
  parseDateISO,
  stepDateISO,
  toDateISO,
  utcForWallClock,
  wallClockFor,
  zoneOffsetMinutes,
} from "../src/core/time.js";

const at = (iso) => new Date(iso).getTime();

test("zone offsets follow the platform's tz database", () => {
  assert.equal(zoneOffsetMinutes(at("2026-06-15T12:00:00Z"), "Europe/Istanbul"), 180);
  assert.equal(zoneOffsetMinutes(at("2026-01-15T12:00:00Z"), "Europe/London"), 0);
  assert.equal(zoneOffsetMinutes(at("2026-07-15T12:00:00Z"), "Europe/London"), 60);
  assert.equal(zoneOffsetMinutes(at("2026-01-15T12:00:00Z"), "America/New_York"), -300);
  assert.equal(zoneOffsetMinutes(at("2026-07-15T12:00:00Z"), "America/New_York"), -240);
  assert.equal(zoneOffsetMinutes(at("2026-01-15T12:00:00Z"), "Asia/Kathmandu"), 345);
  assert.equal(zoneOffsetMinutes(at("2026-01-15T12:00:00Z"), "Australia/Adelaide"), 630);
  assert.equal(zoneOffsetMinutes(at("2026-07-15T12:00:00Z"), "Australia/Adelaide"), 570);
});

test("wall clock parts round-trip through a UTC instant", () => {
  const cases = [
    ["Europe/Istanbul", "2026-06-15", 9],
    ["America/Los_Angeles", "2026-01-04", 0],
    ["Asia/Tokyo", "2026-12-31", 23],
    ["Pacific/Auckland", "2026-04-05", 3],
  ];
  for (const [zone, date, hour] of cases) {
    const instant = utcForWallClock(date, hour, 0, zone);
    const clock = wallClockFor(instant, zone);
    assert.equal(toDateISO(clock), date, `${zone} date`);
    assert.equal(clock.hour, hour, `${zone} hour`);
    assert.equal(clock.minute, 0, `${zone} minute`);
  }
});

test("a spring-forward gap resolves forward, per the compatible rule", () => {
  const instant = utcForWallClock("2026-03-08", 2, 30, "America/New_York");
  const clock = wallClockFor(instant, "America/New_York");
  assert.equal(clock.hour, 3);
  assert.equal(clock.minute, 30);
});

test("an ambiguous fall-back time resolves to its first occurrence", () => {
  const instant = utcForWallClock("2026-11-01", 1, 30, "America/New_York");
  assert.equal(zoneOffsetMinutes(instant, "America/New_York"), -240);
  const clock = wallClockFor(instant, "America/New_York");
  assert.equal(clock.hour, 1);
  assert.equal(clock.minute, 30);
});

test("zone validity accepts IANA names case-insensitively and rejects junk", () => {
  assert.equal(isValidTimeZone("Europe/Istanbul"), true);
  assert.equal(isValidTimeZone("europe/istanbul"), true);
  assert.equal(isValidTimeZone("UTC"), true);
  assert.equal(isValidTimeZone("Bogus/Zone"), false);
  assert.equal(isValidTimeZone(""), false);
  assert.equal(isValidTimeZone(null), false);
  assert.equal(isValidTimeZone(42), false);
});

test("date parsing rejects impossible and malformed dates", () => {
  assert.deepEqual(parseDateISO("2026-02-28"), { year: 2026, month: 2, day: 28 });
  assert.equal(parseDateISO("2026-02-29"), null);
  assert.equal(parseDateISO("2026-13-01"), null);
  assert.equal(parseDateISO("2026-1-1"), null);
  assert.equal(parseDateISO("2026-06-15T00:00"), null);
  assert.equal(parseDateISO(null), null);
  assert.equal(parseDateISO(""), null);
});

test("local dates and offset labels render predictably", () => {
  assert.equal(localDateISO(at("2026-06-15T22:30:00Z"), "Europe/Istanbul"), "2026-06-16");
  assert.equal(localDateISO(at("2026-06-15T22:30:00Z"), "UTC"), "2026-06-15");
  assert.equal(formatOffset(180), "UTC+03:00");
  assert.equal(formatOffset(-210), "UTC-03:30");
  assert.equal(formatOffset(0), "UTC+00:00");
  assert.equal(compareDateISO("2026-06-15", "2026-06-16"), -1);
  assert.equal(compareDateISO("2026-06-15", "2026-06-15"), 0);
  assert.equal(compareDateISO("2026-06-16", "2026-06-15"), 1);
});

test("the resolved zone is a valid zone name", () => {
  assert.equal(isValidTimeZone(currentZone()), true);
});

test("date stepping crosses months, years and leap days", () => {
  assert.equal(stepDateISO("2026-06-15", 1), "2026-06-16");
  assert.equal(stepDateISO("2026-06-30", 1), "2026-07-01");
  assert.equal(stepDateISO("2026-12-31", 1), "2027-01-01");
  assert.equal(stepDateISO("2026-01-01", -1), "2025-12-31");
  assert.equal(stepDateISO("2024-02-28", 1), "2024-02-29");
  assert.equal(stepDateISO("2026-02-28", 1), "2026-03-01");
  assert.equal(stepDateISO("2026-06-15", 0), "2026-06-15");
  assert.equal(stepDateISO("2026-02-31", 1), null);
  assert.equal(stepDateISO("", 1), null);
  assert.equal(stepDateISO("2026-06-15", Number.NaN), null);
});
