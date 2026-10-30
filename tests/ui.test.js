import test from "node:test";
import assert from "node:assert/strict";

import { buildDayPlan, slotSummary } from "../src/core/schedule.js";
import { copyText } from "../src/ui/clipboard.js";
import {
  CATEGORY_TEXT,
  clockText,
  dateLabel,
  dayOffsetText,
  hourText,
  offsetText,
  pad2,
  qualityShort,
  qualityText,
  rangeText,
  slotTitle,
  summaryLines,
  summaryText,
  weekdayOf,
} from "../src/ui/format.js";

const person = (id, label, zone, workStart = 9, workEnd = 17) => ({
  id,
  label,
  zone,
  workStart,
  workEnd,
});

function samplePlan() {
  return buildDayPlan({
    date: "2026-06-15",
    referenceZone: "Europe/Istanbul",
    participants: [
      person("p1", "Ada", "Europe/Istanbul"),
      person("p2", "Sam", "America/New_York"),
    ],
  });
}

test("clock and offset text are two-digit and predictable", () => {
  assert.equal(pad2(7), "07");
  assert.equal(pad2(23), "23");
  assert.equal(clockText({ hour: 9, minute: 5 }), "09:05");
  assert.equal(clockText({ hour: 0 }), "00:00");
  assert.equal(hourText(14), "14:00");
  assert.equal(dayOffsetText(0), "");
  assert.equal(dayOffsetText(1), "+1d");
  assert.equal(dayOffsetText(-1), "-1d");
  assert.equal(offsetText(Date.UTC(2026, 5, 15, 12), "Europe/Istanbul"), "UTC+03:00");
});

test("weekday and date labels come from the reference zone", () => {
  const plan = samplePlan();
  const expectedWeekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(Date.UTC(2026, 5, 15)).getUTCDay()
  ];
  assert.equal(weekdayOf(plan.date, plan.referenceZone), expectedWeekday);
  assert.equal(dateLabel(plan.date, plan.referenceZone), `${expectedWeekday}, 15 Jun 2026`);
});

test("category wording covers every category", () => {
  for (const key of ["night", "early", "day", "work", "evening"]) {
    assert.equal(typeof CATEGORY_TEXT[key], "string");
  }
});

test("slot summaries read naturally for every participant", () => {
  const plan = samplePlan();
  const slot = slotSummary(plan, 12, 2);
  assert.equal(rangeText({ start: 12, hours: 2 }), "12:00–14:00");
  assert.equal(qualityShort(slot.quality), "Some asleep");
  assert.equal(qualityText(slot.quality), "Someone would be asleep");
  const title = slotTitle(plan, slot);
  assert.ok(title.startsWith("Meeting · "));
  assert.ok(title.endsWith("15 Jun 2026 · 12:00–14:00 Istanbul"));
  assert.deepEqual(summaryLines(slot), [
    "Ada (Istanbul) 12:00–14:00",
    "Sam (New York) 05:00–07:00",
  ]);
  assert.equal(
    summaryText(plan, slot),
    "Meeting · Mon, 15 Jun 2026 · 12:00–14:00 Istanbul\nAda (Istanbul) 12:00–14:00\nSam (New York) 05:00–07:00",
  );
});

test("quality wording changes with the level", () => {
  assert.equal(qualityShort({ level: "awake" }), "All awake");
  assert.equal(qualityText({ level: "awake" }), "Everyone awake, outside work hours");
  assert.equal(qualityShort({ level: "mixed" }), "Some asleep");
  assert.equal(qualityText({ level: "mixed" }), "Someone would be asleep");
});

test("clipboard uses the async API, then the legacy fallback, then fails honestly", async () => {
  const written = [];
  const ok = await copyText("hello", {
    navigatorRef: {
      clipboard: {
        writeText: async (value) => {
          written.push(value);
        },
      },
    },
  });
  assert.equal(ok, true);
  assert.deepEqual(written, ["hello"]);

  let appended = 0;
  let removed = 0;
  let selected = false;
  const fakeDocument = {
    body: { appendChild: () => appended += 1 },
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      select: () => selected = true,
      remove: () => removed += 1,
    }),
    execCommand: () => true,
  };
  const fellBack = await copyText("legacy", {
    navigatorRef: { clipboard: { writeText: async () => { throw new Error("denied"); } } },
    documentRef: fakeDocument,
  });
  assert.equal(fellBack, true);
  assert.equal(appended, 1);
  assert.equal(selected, true);
  assert.equal(removed, 1);

  const failed = await copyText("nope", {
    navigatorRef: { clipboard: { writeText: async () => { throw new Error("denied"); } } },
    documentRef: undefined,
  });
  assert.equal(failed, false);
});
