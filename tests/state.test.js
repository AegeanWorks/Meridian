import test from "node:test";
import assert from "node:assert/strict";

import {
  HASH_STATUS,
  MAX_PARTICIPANTS,
  STATE_VERSION,
  decodePlan,
  defaultPlan,
  encodePlan,
  normalizeParticipant,
  normalizePlan,
  normalizeWorkHour,
  planEquals,
  readShareHash,
  shareUrl,
} from "../src/core/state.js";

const valid = () => ({
  date: "2026-06-15",
  referenceZone: "Europe/Istanbul",
  participants: [{ label: "Ada", zone: "Europe/Istanbul", workStart: 9, workEnd: 17 }],
});

const at = (iso) => new Date(iso).getTime();

test("the default plan is the viewer's zone plus one guest in another region", () => {
  const plan = defaultPlan(at("2026-06-15T12:00:00Z"), "Europe/Istanbul");
  assert.equal(plan.version, STATE_VERSION);
  assert.equal(plan.date, "2026-06-15");
  assert.equal(plan.referenceZone, "Europe/Istanbul");
  assert.equal(plan.participants.length, 2);
  assert.deepEqual(plan.participants[0], {
    id: "p1",
    label: "You",
    zone: "Europe/Istanbul",
    workStart: 9,
    workEnd: 17,
  });
  assert.notEqual(plan.participants[1].zone, "Europe/Istanbul");
  assert.equal(plan.participants[1].label, "New York");
});

test("the default plan falls back to UTC for an unknown zone", () => {
  const plan = defaultPlan(at("2026-06-15T22:30:00Z"), "Bogus/Zone");
  assert.equal(plan.referenceZone, "UTC");
  assert.equal(plan.date, "2026-06-15");
});

test("malformed plans are rejected instead of half-loaded", () => {
  assert.equal(normalizePlan(null), null);
  assert.equal(normalizePlan({}), null);
  assert.equal(normalizePlan({ ...valid(), date: "2026-02-30" }), null);
  assert.equal(normalizePlan({ ...valid(), referenceZone: "Nowhere/Zone" }), null);
  assert.equal(normalizePlan({ ...valid(), participants: [] }), null);
  assert.equal(normalizePlan({ ...valid(), participants: [{ zone: "Nope/Nope" }] }), null);
});

test("participants are normalized, defaulted and capped", () => {
  const normalized = normalizeParticipant(
    { label: "  Ada   Lovelace ", zone: "Europe/Istanbul", workStart: 25, workEnd: -4 },
    0,
    new Set(),
  );
  assert.equal(normalized.label, "Ada Lovelace");
  assert.equal(normalized.workStart, 9);
  assert.equal(normalized.workEnd, 17);
  assert.equal(normalized.id, "p1");

  const named = normalizeParticipant(
    { id: "ada", label: "", zone: "America/New_York", workStart: 0, workEnd: 23 },
    1,
    new Set(),
  );
  assert.equal(named.id, "ada");
  assert.equal(named.label, "New York");
  assert.equal(named.workStart, 0);
  assert.equal(named.workEnd, 23);

  const long = normalizeParticipant(
    { label: "x".repeat(80), zone: "UTC" },
    2,
    new Set(),
  );
  assert.equal(long.label.length, 40);

  const used = new Set(["p1"]);
  assert.equal(normalizeParticipant({ zone: "UTC" }, 0, used).id, "p1-2");
  assert.equal(used.has("p1-2"), true);
  assert.equal(normalizeParticipant({ zone: "Bad/Zone" }, 3, used), null);

  const many = Array.from({ length: MAX_PARTICIPANTS + 5 }, (_, index) => ({
    label: `P${index}`,
    zone: "UTC",
  }));
  const plan = normalizePlan({ ...valid(), participants: many });
  assert.equal(plan.participants.length, MAX_PARTICIPANTS);
});

test("a plan round-trips through the URL hash losslessly", () => {
  const plan = normalizePlan({
    date: "2026-11-01",
    referenceZone: "America/New_York",
    participants: [
      { label: "Ada 🌊", zone: "America/Argentina/Buenos_Aires", workStart: 8, workEnd: 18 },
      { label: "", zone: "Asia/Kolkata", workStart: 10, workEnd: 19 },
    ],
  });
  const encoded = encodePlan(plan);
  assert.match(encoded, /^#p=/);
  assert.deepEqual(decodePlan(encoded), plan);
  assert.equal(planEquals(plan, decodePlan(encoded)), true);
});

test("decoding never throws on hand-edited hashes", () => {
  assert.equal(decodePlan(""), null);
  assert.equal(decodePlan("#p=%E0%A4%A"), null);
  assert.equal(decodePlan("#p=not-json"), null);
  assert.equal(decodePlan("#p={}"), null);
  assert.equal(decodePlan("#p=%7B%22d%22%3A%222026-06-15%22%7D"), null);
  assert.equal(decodePlan("#other=1"), null);
  assert.equal(decodePlan(null), null);
});

test("decoding accepts both the compact and object participant forms", () => {
  const compact = decodePlan(
    `#p=${encodeURIComponent(
      JSON.stringify({
        v: 1,
        d: "2026-06-15",
        r: "UTC",
        p: [["Ada", "Europe/Istanbul", 9, 17]],
      }),
    )}`,
  );
  assert.equal(compact.participants[0].label, "Ada");
  assert.equal(compact.participants[0].zone, "Europe/Istanbul");

  const objects = decodePlan(
    `#p=${encodeURIComponent(
      JSON.stringify({
        v: 1,
        d: "2026-06-15",
        r: "UTC",
        p: [{ label: "Sam", zone: "America/New_York", workStart: 7, workEnd: 15 }],
      }),
    )}`,
  );
  assert.equal(objects.participants[0].label, "Sam");
  assert.equal(objects.participants[0].workStart, 7);
});

test("share links replace any previous hash", () => {
  const plan = normalizePlan(valid());
  assert.equal(shareUrl(plan, "/meridian/#old"), `/meridian/${encodePlan(plan)}`);
  assert.equal(shareUrl(plan, "/meridian/").includes("#p="), true);
});

test("an unsupported plan version is refused", () => {
  const link = (version) =>
    `#p=${encodeURIComponent(
      JSON.stringify({
        ...(version === undefined ? {} : { v: version }),
        d: "2026-06-15",
        r: "UTC",
        p: [["Ada", "Europe/Istanbul", 9, 17]],
      }),
    )}`;
  assert.equal(decodePlan(link(1))?.version, STATE_VERSION);
  assert.equal(decodePlan(link())?.version, STATE_VERSION);
  assert.equal(decodePlan(link(2)), null);
  assert.equal(decodePlan(link(99)), null);
  assert.equal(decodePlan(link("2")), null);
  assert.equal(normalizePlan({ ...valid(), version: 2 }), null);
  assert.equal(normalizePlan({ ...valid(), version: STATE_VERSION })?.version, STATE_VERSION);
});

test("a share hash reports empty, valid and invalid outcomes", () => {
  assert.deepEqual(readShareHash(""), { status: HASH_STATUS.EMPTY, plan: null });
  assert.deepEqual(readShareHash("#grid"), { status: HASH_STATUS.EMPTY, plan: null });
  const validLink = `#p=${encodeURIComponent(
    JSON.stringify({ v: 1, d: "2026-06-15", r: "UTC", p: [["Ada", "Europe/Istanbul", 9, 17]] }),
  )}`;
  const loaded = readShareHash(validLink);
  assert.equal(loaded.status, HASH_STATUS.VALID);
  assert.equal(loaded.plan.date, "2026-06-15");
  assert.equal(readShareHash("#p=not-json").status, HASH_STATUS.INVALID);
  assert.equal(readShareHash("#p=%7B%22v%22%3A2%7D").status, HASH_STATUS.INVALID);
});

test("work hours are normalized at every boundary", () => {
  assert.equal(normalizeWorkHour(0, 9), 0);
  assert.equal(normalizeWorkHour(23, 9), 23);
  assert.equal(normalizeWorkHour("17", 9), 17);
  assert.equal(normalizeWorkHour(24, 9), 9);
  assert.equal(normalizeWorkHour(-1, 17), 17);
  assert.equal(normalizeWorkHour(9.5, 9), 9);
  assert.equal(normalizeWorkHour(null, 9), 9);
  assert.equal(normalizeWorkHour("", 17), 17);
});

test("a plan stores zone identifiers in catalog form", () => {
  const plan = normalizePlan({
    ...valid(),
    referenceZone: "europe/istanbul",
    participants: [{ label: "Ada", zone: "AMERICA/NEW_YORK", workStart: 9, workEnd: 17 }],
  });
  assert.equal(plan.referenceZone, "Europe/Istanbul");
  assert.equal(plan.participants[0].zone, "America/New_York");
});
