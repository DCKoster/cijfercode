import { describe, expect, it } from "vitest";
import { SeededRandom } from "./random";

describe("SeededRandom", () => {
  it("is deterministic and seed-sensitive", () => {
    const first = new SeededRandom("zelfde");
    const second = new SeededRandom("zelfde");
    const other = new SeededRandom("anders");
    const values = () => Array.from({ length: 8 }, () => first.next());
    const firstValues = values();
    expect(firstValues).toEqual(Array.from({ length: 8 }, () => second.next()));
    expect(firstValues).not.toEqual(Array.from({ length: 8 }, () => other.next()));
  });
});
