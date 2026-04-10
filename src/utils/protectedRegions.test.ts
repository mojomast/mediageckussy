import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProtectedRegions, extractProtectedRegions, reapplyProtectedRegions } from "./protectedRegions.js";

test("extractProtectedRegions handles empty file", () => {
  assert.deepEqual([...extractProtectedRegions("").entries()], []);
});

test("extractProtectedRegions handles files with no markers", () => {
  assert.deepEqual([...extractProtectedRegions("hello world").entries()], []);
});

test("extractProtectedRegions handles one region", () => {
  const content = "before\n<!-- MANUAL_EDIT_START: one -->\ncustom\n<!-- MANUAL_EDIT_END: one -->\nafter";
  assert.equal(extractProtectedRegions(content).get("one"), "\ncustom\n");
});

test("extractProtectedRegions handles multiple regions", () => {
  const content = [
    "<!-- MANUAL_EDIT_START: one -->a<!-- MANUAL_EDIT_END: one -->",
    "<!-- MANUAL_EDIT_START: two -->b<!-- MANUAL_EDIT_END: two -->",
  ].join("\n");
  const regions = extractProtectedRegions(content);
  assert.equal(regions.get("one"), "a");
  assert.equal(regions.get("two"), "b");
});

test("extractProtectedRegions errors on nested markers", () => {
  const content = "<!-- MANUAL_EDIT_START: outer -->x<!-- MANUAL_EDIT_START: inner -->y<!-- MANUAL_EDIT_END: inner --><!-- MANUAL_EDIT_END: outer -->";
  assert.throws(() => extractProtectedRegions(content), /Nested MANUAL_EDIT regions/);
});

test("analyzeProtectedRegions warns on mismatched markers", () => {
  const content = "<!-- MANUAL_EDIT_START: one -->x<!-- MANUAL_EDIT_END: two -->";
  const analysis = analyzeProtectedRegions(content);
  assert.equal(analysis.regions.size, 0);
  assert.equal(analysis.warnings.length, 1);
});

test("reapplyProtectedRegions preserves one region", () => {
  const existing = "<!-- MANUAL_EDIT_START: one -->custom<!-- MANUAL_EDIT_END: one -->";
  const fresh = "<!-- MANUAL_EDIT_START: one -->generated<!-- MANUAL_EDIT_END: one -->";
  const result = reapplyProtectedRegions(fresh, extractProtectedRegions(existing));
  assert.equal(result, existing);
});

test("reapplyProtectedRegions preserves multiple regions", () => {
  const existing = [
    "<!-- MANUAL_EDIT_START: one -->A<!-- MANUAL_EDIT_END: one -->",
    "<!-- MANUAL_EDIT_START: two -->B<!-- MANUAL_EDIT_END: two -->",
  ].join("\n");
  const fresh = [
    "<!-- MANUAL_EDIT_START: one -->X<!-- MANUAL_EDIT_END: one -->",
    "<!-- MANUAL_EDIT_START: two -->Y<!-- MANUAL_EDIT_END: two -->",
  ].join("\n");
  const result = reapplyProtectedRegions(fresh, extractProtectedRegions(existing));
  assert.equal(result, existing);
});
