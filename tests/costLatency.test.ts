import assert from "node:assert/strict";
import { test } from "node:test";
import {
  costSaved,
  latencySaved,
  TIER_COST_USD,
  TIER_LATENCY_MS,
} from "../src/metrics/costLatency.js";

test("costSaved is fallback baseline minus chosen-tier baseline", () => {
  assert.equal(
    costSaved("fast", "balanced"),
    TIER_COST_USD.balanced - TIER_COST_USD.fast,
  );
  assert.equal(
    costSaved("frontier", "fast"),
    TIER_COST_USD.fast - TIER_COST_USD.frontier,
  );
});

test("costSaved is positive when chosen is cheaper than fallback", () => {
  const saved = costSaved("fast", "balanced");
  assert.ok(saved > 0);
  assert.equal(saved, TIER_COST_USD.balanced - TIER_COST_USD.fast);
});

test("costSaved is zero when chosen tier is the fallback tier", () => {
  assert.equal(costSaved("balanced", "balanced"), 0);
  assert.equal(costSaved("fast", "fast"), 0);
  assert.equal(costSaved("frontier", "frontier"), 0);
});

test("costSaved is negative when chosen is more expensive than fallback", () => {
  const saved = costSaved("frontier", "balanced");
  assert.ok(saved < 0);
  assert.equal(saved, TIER_COST_USD.balanced - TIER_COST_USD.frontier);
});

test("latencySaved is fallback baseline minus chosen-tier baseline", () => {
  assert.equal(
    latencySaved("fast", "balanced"),
    TIER_LATENCY_MS.balanced - TIER_LATENCY_MS.fast,
  );
  assert.equal(
    latencySaved("frontier", "fast"),
    TIER_LATENCY_MS.fast - TIER_LATENCY_MS.frontier,
  );
});

test("latencySaved is positive when chosen is faster than fallback", () => {
  const saved = latencySaved("fast", "balanced");
  assert.ok(saved > 0);
  assert.equal(saved, TIER_LATENCY_MS.balanced - TIER_LATENCY_MS.fast);
});

test("latencySaved is zero when chosen tier is the fallback tier", () => {
  assert.equal(latencySaved("balanced", "balanced"), 0);
  assert.equal(latencySaved("fast", "fast"), 0);
  assert.equal(latencySaved("frontier", "frontier"), 0);
});

test("latencySaved is negative when chosen is slower than fallback", () => {
  const saved = latencySaved("frontier", "balanced");
  assert.ok(saved < 0);
  assert.equal(saved, TIER_LATENCY_MS.balanced - TIER_LATENCY_MS.frontier);
});

test("baselines are per tier, not per model", () => {
  assert.equal(Object.keys(TIER_COST_USD).sort().join(","), "balanced,fast,frontier");
  assert.equal(
    Object.keys(TIER_LATENCY_MS).sort().join(","),
    "balanced,fast,frontier",
  );
  assert.equal(costSaved("fast", "frontier"), costSaved("fast", "frontier"));
});
