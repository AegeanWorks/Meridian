import test from "node:test";
import assert from "node:assert/strict";

import { buildIcsCalendar, foldIcsLine, icsEscape, icsStamp } from "../src/core/ics.js";

const encoder = new TextEncoder();
const octets = (text) => encoder.encode(text).length;
const CRLF = "\r\n";

test("text is escaped per RFC 5545", () => {
  assert.equal(icsEscape("a,b;c\\d"), "a\\,b\\;c\\\\d");
  assert.equal(icsEscape("line one\nline two\r\nline three"), "line one\\nline two\\nline three");
  assert.equal(icsEscape(""), "");
  assert.equal(icsEscape(null), "");
});

test("timestamps are always UTC with a trailing Z", () => {
  assert.equal(icsStamp(new Date("2026-06-15T09:05:07Z")), "20260615T090507Z");
  assert.equal(icsStamp(Date.UTC(2026, 0, 2, 3, 4, 5)), "20260102T030405Z");
});

test("long lines fold at 75 octets and continuations start with a space", () => {
  const line = "DESCRIPTION:" + "x".repeat(200);
  const folded = foldIcsLine(line).split(CRLF);
  assert.ok(folded.length > 1);
  for (const part of folded) {
    assert.ok(octets(part) <= 75, `line too long: ${octets(part)}`);
  }
  assert.equal(folded[1].startsWith(" "), true);
  assert.equal(folded.map((part, index) => (index === 0 ? part : part.slice(1))).join(""), line);
});

test("multibyte text folds without splitting a character", () => {
  const line = "SUMMARY:" + "🌊".repeat(40);
  const folded = foldIcsLine(line).split(CRLF);
  for (const part of folded) {
    assert.ok(octets(part) <= 75);
    assert.equal(part.includes("\uFFFD"), false);
  }
  const rebuilt = folded.map((part, index) => (index === 0 ? part : part.slice(1))).join("");
  assert.equal(rebuilt, line);
});

test("a calendar is byte-exact for fixed inputs", () => {
  const text = buildIcsCalendar({
    summary: "Meeting · Mon, 15 Jun 2026 · 14:00–16:00 Istanbul",
    description: "Ada (Istanbul) 14:00–16:00",
    startUtc: Date.UTC(2026, 5, 15, 11, 0),
    endUtc: Date.UTC(2026, 5, 15, 13, 0),
    now: Date.UTC(2026, 5, 1, 8, 0),
    uid: "test-uid",
  });
  const expected = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AegeanWorks//Meridian//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:test-uid",
    "DTSTAMP:20260601T080000Z",
    "DTSTART:20260615T110000Z",
    "DTEND:20260615T130000Z",
    "SUMMARY:Meeting · Mon\\, 15 Jun 2026 · 14:00–16:00 Istanbul",
    "DESCRIPTION:Ada (Istanbul) 14:00–16:00",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join(CRLF);
  assert.equal(text, `${expected}${CRLF}`);
});

test("a generated event still carries every required property", () => {
  const text = buildIcsCalendar({
    summary: "Standup",
    startUtc: Date.UTC(2026, 5, 15, 9, 0),
    endUtc: Date.UTC(2026, 5, 15, 10, 0),
  });
  assert.match(text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(text, /UID:meridian-\d{8}T\d{6}Z-[a-z0-9]+\r\n/);
  assert.match(text, /DTSTART:20260615T090000Z\r\n/);
  assert.match(text, /DTEND:20260615T100000Z\r\n/);
  assert.equal(text.endsWith(`${CRLF}`), true);
});
