import { expect, test } from "vitest";
import { dateOnly } from "../dates.js";

test("dateOnly formats the local calendar date", () => {
  expect(dateOnly(new Date(2000, 0, 2, 3, 4, 5))).toBe("2000-01-02");
});

test("dateOnly preserves explicit date strings", () => {
  expect(dateOnly("2000-01-02")).toBe("2000-01-02");
});
