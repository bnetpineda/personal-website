import { describe, expect, test } from "bun:test";
import { FormSnapshots, formSignature } from "./form-dirty";

const fields = (values: Record<string, string>) => {
  const form = {};
  let current = values;
  return {
    set: (next: Record<string, string>) => {
      current = next;
    },
    view: () => ({ form, entries: () => Object.entries(current) as [string, string][] }),
  };
};

describe("sheet discard guard", () => {
  test("a changed hidden value (Select, toggle group, date picker) counts as a change", () => {
    const entry = fields({ kind: "expense", categoryId: "food", occurredOn: "2026-11-01", amount: "" });
    const snapshots = new FormSnapshots();
    snapshots.remember([entry.view()]);
    expect(snapshots.changed([entry.view()])).toBe(false);
    entry.set({ kind: "expense", categoryId: "transport", occurredOn: "2026-11-02", amount: "" });
    expect(snapshots.changed([entry.view()])).toBe(true);
  });

  test("changing a value back is clean again", () => {
    const entry = fields({ categoryId: "food" });
    const snapshots = new FormSnapshots();
    snapshots.remember([entry.view()]);
    entry.set({ categoryId: "rent" });
    entry.set({ categoryId: "food" });
    expect(snapshots.changed([entry.view()])).toBe(false);
  });

  test("remember keeps the first snapshot; reset takes the saved values as clean", () => {
    const entry = fields({ note: "" });
    const snapshots = new FormSnapshots();
    snapshots.remember([entry.view()]);
    entry.set({ note: "lunch" });
    snapshots.remember([entry.view()]);
    expect(snapshots.changed([entry.view()])).toBe(true);
    snapshots.reset([entry.view()]);
    expect(snapshots.changed([entry.view()])).toBe(false);
  });

  test("a form that appeared after the last interaction is not treated as edited", () => {
    const entry = fields({ note: "x" });
    expect(new FormSnapshots().changed([entry.view()])).toBe(false);
  });

  test("checkbox presence and repeated names are part of the signature", () => {
    expect(formSignature([["autoPost", "on"]])).not.toBe(formSignature([]));
    expect(formSignature([["tag", "a"], ["tag", "b"]])).not.toBe(formSignature([["tag", "b"], ["tag", "a"]]));
  });
});
