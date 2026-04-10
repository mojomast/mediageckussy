import { describe, expect, test } from "vitest";
import { analyzeProtectedRegions, extractProtectedRegions, reapplyProtectedRegions } from "./protectedRegions.js";

describe("protected regions", () => {
  test("extractProtectedRegions handles empty file", () => {
    expect([...extractProtectedRegions("").entries()]).toEqual([]);
  });

  test("extractProtectedRegions handles files with no markers", () => {
    expect([...extractProtectedRegions("hello world").entries()]).toEqual([]);
  });

  test("extractProtectedRegions handles one region", () => {
    const content = "before\n<!-- MANUAL_EDIT_START: one -->\ncustom\n<!-- MANUAL_EDIT_END: one -->\nafter";
    expect(extractProtectedRegions(content).get("one")).toBe("\ncustom\n");
  });

  test("extractProtectedRegions handles multiple regions", () => {
    const content = [
      "<!-- MANUAL_EDIT_START: one -->a<!-- MANUAL_EDIT_END: one -->",
      "<!-- MANUAL_EDIT_START: two -->b<!-- MANUAL_EDIT_END: two -->",
    ].join("\n");
    const regions = extractProtectedRegions(content);
    expect(regions.get("one")).toBe("a");
    expect(regions.get("two")).toBe("b");
  });

  test("extractProtectedRegions errors on nested markers", () => {
    const content = "<!-- MANUAL_EDIT_START: outer -->x<!-- MANUAL_EDIT_START: inner -->y<!-- MANUAL_EDIT_END: inner --><!-- MANUAL_EDIT_END: outer -->";
    expect(() => extractProtectedRegions(content)).toThrow(/Nested MANUAL_EDIT regions/);
  });

  test("analyzeProtectedRegions warns on mismatched markers", () => {
    const content = "<!-- MANUAL_EDIT_START: one -->x<!-- MANUAL_EDIT_END: two -->";
    const analysis = analyzeProtectedRegions(content);
    expect(analysis.regions.size).toBe(0);
    expect(analysis.warnings).toHaveLength(1);
  });

  test("reapplyProtectedRegions preserves one region", () => {
    const existing = "<!-- MANUAL_EDIT_START: one -->custom<!-- MANUAL_EDIT_END: one -->";
    const fresh = "<!-- MANUAL_EDIT_START: one -->generated<!-- MANUAL_EDIT_END: one -->";
    const result = reapplyProtectedRegions(fresh, extractProtectedRegions(existing));
    expect(result).toBe(existing);
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
    expect(result).toBe(existing);
  });
});
