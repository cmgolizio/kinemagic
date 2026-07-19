import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare } from "@/share/codec";
import { MOTD_LIST, mechanismOfTheDay } from "@/share/motd";
import { roundedForWire } from "@/share/wire-testutil";
import { sliceToShare, useSimStore } from "./simStore";

describe("store ↔ share round-trip", () => {
  it("loadShared reconstructs every curated mechanism exactly", () => {
    for (const entry of MOTD_LIST) {
      const wire = decodeShare(encodeShare(entry.mech));
      expect(wire, entry.id).not.toBeNull();
      useSimStore.getState().loadShared(wire!);
      const st = useSimStore.getState();

      const back = sliceToShare(st.mech, st.theta);
      expect(back.t, entry.id).toBe(wire!.t);
      // Geometry must survive exactly (wire numbers are already rounded).
      expect(roundedForWire(back.c), entry.id).toEqual(wire!.c);
      // θ may be normalized/clamped by the solver but must land on the
      // same pose for any in-range starting angle.
      expect(back.th, entry.id).toBeCloseTo(wire!.th, 3);
    }
  });

  it("watt and peaucellier land on the right straight-line variant", () => {
    const watt = MOTD_LIST.find((e) => e.mech.t === "watt")!;
    useSimStore.getState().loadShared(watt.mech);
    let mech = useSimStore.getState().mech;
    expect(mech.type).toBe("straightline");
    if (mech.type === "straightline") expect(mech.variant).toBe("watt");

    const peau = MOTD_LIST.find((e) => e.mech.t === "peaucellier")!;
    useSimStore.getState().loadShared(peau.mech);
    mech = useSimStore.getState().mech;
    expect(mech.type).toBe("straightline");
    if (mech.type === "straightline") expect(mech.variant).toBe("peaucellier");
  });

  it("loadShared marks the session bootstrapped and clears the MOTD banner", () => {
    const motd = mechanismOfTheDay(new Date("2026-07-18T12:00:00Z"));
    useSimStore.getState().loadMotd(motd);
    expect(useSimStore.getState().motd?.title).toBe(motd.title);
    expect(useSimStore.getState().bootstrapped).toBe(true);

    useSimStore.getState().loadShared(MOTD_LIST[0].mech);
    expect(useSimStore.getState().motd).toBeNull();
  });

  it("solves to a live pose for the curve mechanisms", () => {
    for (const entry of MOTD_LIST) {
      useSimStore.getState().loadShared(entry.mech);
      const mech = useSimStore.getState().mech;
      if (mech.type === "fourbar") expect(mech.pose.ok, entry.id).toBe(true);
      if (mech.type === "slidercrank") expect(mech.pose.ok, entry.id).toBe(true);
      if (mech.type === "straightline") {
        const pose = mech.variant === "watt" ? mech.wattPose : mech.peauPose;
        expect(pose?.ok, entry.id).toBe(true);
      }
    }
  });
});
