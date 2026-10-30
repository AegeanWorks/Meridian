import test from "node:test";
import assert from "node:assert/strict";

import {
  AWAKE,
  DEFAULT_WORK,
  bestSlotFor,
  bestWindows,
  buildDayPlan,
  hourCategory,
  isWorkHour,
  overlapColumns,
  slotQuality,
  slotSummary,
} from "../src/core/schedule.js";

const person = (id, label, zone, workStart = 9, workEnd = 17) => ({
  id,
  label,
  zone,
  workStart,
  workEnd,
});

test("work hours can cross midnight", () => {
  assert.equal(isWorkHour(9), true);
  assert.equal(isWorkHour(16), true);
  assert.equal(isWorkHour(17), false);
  assert.equal(isWorkHour(8), false);
  assert.equal(isWorkHour(23, { start: 22, end: 6 }), true);
  assert.equal(isWorkHour(0, { start: 22, end: 6 }), true);
  assert.equal(isWorkHour(5, { start: 22, end: 6 }), true);
  assert.equal(isWorkHour(6, { start: 22, end: 6 }), false);
  assert.equal(isWorkHour(12, { start: 22, end: 6 }), false);
  assert.equal(isWorkHour(10, { start: 9, end: 9 }), false);
});

test("hour categories prefer work hours and follow the clock otherwise", () => {
  assert.equal(hourCategory(10), "work");
  assert.equal(hourCategory(23), "night");
  assert.equal(hourCategory(3), "night");
  assert.equal(hourCategory(6), "early");
  assert.equal(hourCategory(7), "early");
  assert.equal(hourCategory(8), "day");
  assert.equal(hourCategory(16), "work");
  assert.equal(hourCategory(17), "evening");
  assert.equal(hourCategory(21), "evening");
  assert.equal(hourCategory(22), "night");
  assert.equal(hourCategory(23, { start: 22, end: 6 }), "work");
  assert.equal(hourCategory(2, { start: 22, end: 6 }), "work");
  assert.equal(hourCategory(12, { start: 22, end: 6 }), "day");
});

test("a day plan aligns each participant to reference hours", () => {
  const plan = buildDayPlan({
    date: "2026-06-15",
    referenceZone: "Europe/Istanbul",
    participants: [
      person("p1", "Ada", "Europe/Istanbul"),
      person("p2", "Sam", "Europe/London"),
    ],
  });
  assert.equal(plan.columns.length, 24);
  assert.equal(plan.columns[0].hour, 0);
  assert.equal(plan.rows.length, 2);
  assert.equal(plan.rows[0].cells[0].hour, 0);
  assert.equal(plan.rows[0].cells[0].dayOffset, 0);
  assert.equal(plan.rows[1].cells[0].hour, 22);
  assert.equal(plan.rows[1].cells[0].dayOffset, -1);
  assert.equal(plan.rows[1].cells[2].hour, 0);
  assert.equal(plan.rows[1].cells[2].dayOffset, 0);
});

test("overlap columns mark hours inside every work day", () => {
  const plan = buildDayPlan({
    date: "2026-06-15",
    referenceZone: "Europe/Istanbul",
    participants: [
      person("p1", "Ada", "Europe/Istanbul"),
      person("p2", "Sam", "Europe/London"),
    ],
  });
  const work = plan.overlap.work;
  assert.equal(work[10], false);
  for (let index = 11; index <= 16; index += 1) {
    assert.equal(work[index], true, `column ${index} should be shared work`);
  }
  assert.equal(work[17], false);
  assert.deepEqual(plan.windows.work, [{ start: 11, end: 17, hours: 6 }]);
  assert.ok(plan.overlap.awake.some(Boolean));
});

test("day offsets track a participant one day ahead", () => {
  const plan = buildDayPlan({
    date: "2026-06-15",
    referenceZone: "Pacific/Honolulu",
    participants: [
      person("p1", "Kai", "Pacific/Honolulu"),
      person("p2", "Mei", "Asia/Tokyo"),
    ],
  });
  assert.equal(plan.rows[1].cells[0].dayOffset, 0);
  assert.equal(plan.rows[1].cells[0].hour, 19);
  assert.equal(plan.rows[1].cells[14].dayOffset, 1);
  assert.equal(plan.rows[1].cells[14].hour, 9);
});

test("contiguous windows rank by length then start", () => {
  assert.deepEqual(bestWindows([true, true, false, true]), [
    { start: 0, end: 2, hours: 2 },
    { start: 3, end: 4, hours: 1 },
  ]);
  assert.deepEqual(bestWindows([false, false]), []);
  assert.deepEqual(bestWindows([true, true, true]), [{ start: 0, end: 3, hours: 3 }]);
});

test("overlapColumns reports columns nobody covers", () => {
  const day = (category, hour) =>
    Array.from({ length: 24 }, (_, index) => ({ category: index === 0 ? category : "night", hour: index === 0 ? hour : 23 }));
  const rows = [{ cells: day("work", 9) }, { cells: day("work", 9) }];
  const overlap = overlapColumns(rows);
  assert.equal(overlap.work[0], true);
  assert.equal(overlap.work[1], false);
  assert.equal(overlap.awake[0], true);
  assert.equal(overlap.awake[1], false);
});

test("a slot summary shows every participant's local hours", () => {
  const plan = buildDayPlan({
    date: "2026-06-15",
    referenceZone: "Europe/Istanbul",
    participants: [
      person("p1", "Ada", "Europe/Istanbul"),
      person("p2", "Mei", "Asia/Tokyo"),
      person("p3", "Sam", "America/Los_Angeles"),
    ],
  });
  const slot = slotSummary(plan, 12, 2);
  assert.equal(slot.hours, 2);
  assert.equal(slot.startUtc, plan.columns[12].startUtc);
  assert.equal(slot.rows[0].from.hour, 12);
  assert.equal(slot.rows[1].from.hour, 18);
  assert.equal(slot.rows[2].from.hour, 2);
  assert.equal(slot.quality.level, "mixed");
  assert.deepEqual(slot.quality.offenders, ["Mei", "Sam"]);
});

test("slot quality grades work, awake and mixed coverage", () => {
  const plan = buildDayPlan({
    date: "2026-06-15",
    referenceZone: "Europe/Istanbul",
    participants: [
      person("p1", "Ada", "Europe/Istanbul"),
      person("p2", "Sam", "Europe/London"),
    ],
  });
  assert.equal(slotQuality(plan, 13, 1).level, "work");
  assert.equal(slotQuality(plan, 20, 1).level, "awake");
  assert.equal(slotQuality(plan, 3, 1).level, "mixed");
  assert.deepEqual(slotQuality(plan, 3, 1).offenders, ["Ada", "Sam"]);
});

test("the best slot prefers a shared work window and fits the request", () => {
  const plan = buildDayPlan({
    date: "2026-06-15",
    referenceZone: "Europe/Istanbul",
    participants: [
      person("p1", "Ada", "Europe/Istanbul"),
      person("p2", "Sam", "Europe/London"),
    ],
  });
  assert.deepEqual(bestSlotFor(plan, 2), { start: 11, hours: 2 });
  assert.deepEqual(bestSlotFor(plan, 12), { start: 11, hours: 6 });

  const spread = buildDayPlan({
    date: "2026-06-15",
    referenceZone: "Europe/Istanbul",
    participants: [
      person("p1", "Mei", "Asia/Tokyo"),
      person("p2", "Sam", "America/Los_Angeles"),
    ],
  });
  const best = bestSlotFor(spread, 1);
  assert.ok(best, "a shared awake window exists");
  assert.equal(slotQuality(spread, best.start, best.hours).level !== "mixed", true);
});

test("defaults and constants stay stable", () => {
  assert.deepEqual(DEFAULT_WORK, { start: 9, end: 17 });
  assert.deepEqual(AWAKE, { start: 7, end: 22 });
});
