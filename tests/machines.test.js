import test from "node:test";
import assert from "node:assert/strict";

import { MACHINES, MACHINE_NAMES, canTransition } from "../src/core/machines.js";
import { HASH_STATUS, STATE_VERSION } from "../src/core/state.js";
import { buildDayPlan, slotQuality } from "../src/core/schedule.js";
import { CATEGORY_TEXT } from "../src/ui/format.js";

const person = (id, label, zone, workStart = 9, workEnd = 17) => ({
  id,
  label,
  zone,
  workStart,
  workEnd,
});

test("every declared machine is internally consistent", () => {
  assert.ok(MACHINE_NAMES.length >= 20);
  assert.equal(MACHINE_NAMES.length, Object.keys(MACHINES).length);
  for (const name of MACHINE_NAMES) {
    const machine = MACHINES[name];
    assert.equal(machine.name, name);
    assert.ok(machine.states.length >= 2, `${name} needs at least two states`);
    assert.equal(
      new Set(machine.states).size,
      machine.states.length,
      `${name} declares a duplicate state`,
    );
    assert.ok(machine.states.includes(machine.initial), `${name} initial state is undeclared`);
    assert.equal(typeof machine.source, "string");
    assert.ok(Object.isFrozen(machine.states), `${name} states must be frozen`);
    for (const [from, targets] of Object.entries(machine.transitions)) {
      assert.ok(machine.states.includes(from), `${name} has an undeclared source ${from}`);
      for (const to of targets) {
        assert.ok(machine.states.includes(to), `${name} has an undeclared target ${to}`);
      }
    }
  }
  assert.ok(Object.isFrozen(MACHINES));
  assert.ok(Object.isFrozen(MACHINE_NAMES));
});

test("the registry names the runtime vocabularies", () => {
  assert.deepEqual(MACHINES["cell-category"].states, Object.keys(CATEGORY_TEXT));
  assert.deepEqual(MACHINES["hash-read"].states, Object.values(HASH_STATUS));
  assert.equal(MACHINES["plan-version"].current, STATE_VERSION);

  const plan = buildDayPlan({
    date: "2026-06-15",
    referenceZone: "Europe/Istanbul",
    participants: [
      person("p1", "Ada", "Europe/Istanbul"),
      person("p2", "Sam", "Europe/London"),
    ],
  });
  for (const [start, hours] of [
    [13, 1],
    [20, 1],
    [3, 1],
  ]) {
    assert.ok(MACHINES["slot-quality"].states.includes(slotQuality(plan, start, hours).level));
  }
});

test("canTransition answers from the table and rejects unknown machines", () => {
  assert.equal(canTransition("slot", "none", "selected"), true);
  assert.equal(canTransition("slot", "selected", "none"), true);
  assert.equal(canTransition("slot", "none", "none"), false);
  assert.equal(canTransition("drag", "idle", "dragging"), true);
  assert.equal(canTransition("drag", "dragging", "dragging"), false);
  assert.throws(() => canTransition("nope", "a", "b"), /unknown machine/i);
});
