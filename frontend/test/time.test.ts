import { describe, expect, it } from "vitest";
import { DAY, dayKey, fmtDuration, fromLocalInput, makeTicks, toLocalInput } from "../src/lib/time";

describe("time helpers", () => {
  it.each([
    [0, "under a minute"],
    [29_999, "under a minute"],
    [60_000, "1 min"],
    [3_600_000, "1 h"],
    [5_460_000, "1 h 31 min"],
    [86_400_000, "1 d"],
    [176_400_000, "2 d 1 h"],
  ])("formats duration %i ms as %s", (duration, expected) => {
    expect(fmtDuration(duration)).toBe(expected);
  });

  it("round-trips local datetime inputs and creates local date keys", () => {
    const value = new Date(2026, 0, 9, 7, 5).getTime();
    expect(toLocalInput(value)).toBe("2026-01-09T07:05");
    expect(fromLocalInput("2026-01-09T07:05")).toBe(value);
    expect(dayKey(value)).toBe("2026-01-09");
  });

  it("creates ordered ticks and date context bands for the selected range", () => {
    const start = new Date(2026, 2, 1).getTime();
    const result = makeTicks(start, start + 5 * DAY, 0.00001);
    expect(result.ticks.length).toBeGreaterThan(0);
    expect(result.ticks.every((tick, index, ticks) => index === 0 || tick.t > ticks[index - 1].t)).toBe(true);
    expect(result.bands.length).toBeGreaterThan(0);
    expect(result.weekends.length).toBeGreaterThan(0);
    expect(result.weekends.every(([from, to]) => to - from === DAY)).toBe(true);
  });

  it("avoids weekend overlays at low zoom and caps tick generation for broad ranges", () => {
    const start = new Date(2020, 0, 1).getTime();
    expect(makeTicks(start, start + 4 * DAY, 0.0000001).weekends).toEqual([]);
    expect(makeTicks(start, new Date(2500, 0, 1).getTime(), 1e-14).ticks.length).toBeLessThanOrEqual(400);
  });
});
