// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fillSlots } from "./fill";
import { SeededRandom } from "./random";
import type { LayoutSlot } from "./layout";

const slots: LayoutSlot[] = [
  { row: 0, column: 0, direction: "across", length: 3, positions: [[0, 0], [0, 1], [0, 2]] },
  { row: 0, column: 1, direction: "down", length: 3, positions: [[0, 1], [1, 1], [2, 1]] },
];
const options = { theme: "general", requireEveryLetter: false, includeProperNames: false, generationMode: "interactive" } as const;

describe("slot CSP", () => {
  it("propagates crossings and prevents duplicate answers deterministically", async () => {
    const words = new Map([[3, [{ word: "CAT", score: 5 }, { word: "ARE", score: 4 }, { word: "CAR", score: 3 }]]]);
    const first = await fillSlots(slots, words, new SeededRandom("fill"), options, 100);
    const second = await fillSlots(slots, words, new SeededRandom("fill"), options, 100);
    expect(first).toEqual(second);
    expect(first?.entries[0].word).not.toBe(first?.entries[1].word);
    expect(first?.grid[0][1]).toBe(first?.entries[1].word[0]);
  });

  it("returns null when the fixed node budget is exhausted", async () => {
    const words = new Map([[3, [{ word: "CAT", score: 5 }, { word: "ARE", score: 4 }]]]);
    expect(await fillSlots(slots, words, new SeededRandom("budget"), options, 0)).toBeNull();
  });
});
