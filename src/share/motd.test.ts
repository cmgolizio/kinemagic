import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare } from "./codec";
import { roundedForWire } from "./wire-testutil";
import { MOTD_LIST, mechanismOfTheDay, utcDayNumber } from "./motd";

describe("mechanism of the day", () => {
  it("every curated entry passes the share schema round-trip", () => {
    for (const entry of MOTD_LIST) {
      const decoded = decodeShare(encodeShare(entry.mech));
      expect(decoded, `entry ${entry.id}`).not.toBeNull();
      expect(decoded).toEqual(roundedForWire(entry.mech));
    }
  });

  it("has unique ids and non-empty copy", () => {
    const ids = MOTD_LIST.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of MOTD_LIST) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.note.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic for a given date, anywhere on earth", () => {
    const d = new Date("2026-07-18T09:30:00Z");
    expect(mechanismOfTheDay(d).id).toBe(mechanismOfTheDay(new Date("2026-07-18T23:59:59Z")).id);
    expect(utcDayNumber(new Date("2026-07-18T00:00:00Z"))).toBe(
      utcDayNumber(new Date("2026-07-18T23:59:59Z")),
    );
  });

  it("rotates daily through the whole list", () => {
    const start = new Date("2026-01-01T12:00:00Z");
    const seen = new Set<string>();
    for (let i = 0; i < MOTD_LIST.length; i++) {
      const d = new Date(start.getTime() + i * 86_400_000);
      seen.add(mechanismOfTheDay(d).id);
    }
    expect(seen.size).toBe(MOTD_LIST.length);
    // and the day after the full cycle wraps back to the first pick
    const wrap = new Date(start.getTime() + MOTD_LIST.length * 86_400_000);
    expect(mechanismOfTheDay(wrap).id).toBe(mechanismOfTheDay(start).id);
  });
});
