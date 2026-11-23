// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fillSlots, indexFillWords, prepareFill } from "./fill";
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
    const first = await fillSlots(slots, prepareFill(slots, indexFillWords(words), false)!, new SeededRandom("fill"), options, 100);
    const second = await fillSlots(slots, prepareFill(slots, indexFillWords(words), false)!, new SeededRandom("fill"), options, 100);
    expect(first).toEqual(second);
    expect(first?.entries[0].word).not.toBe(first?.entries[1].word);
    expect(first?.grid[0][1]).toBe(first?.entries[1].word[0]);
  });

  it("can place a required letter in another slot when the first placement excludes a different letter", async () => {
    const crossingSlots: LayoutSlot[] = [
      { row: 0, column: 0, direction: "across", length: 3, positions: [[0, 0], [0, 1], [0, 2]] },
      { row: 0, column: 0, direction: "down", length: 4, positions: [[0, 0], [1, 0], [2, 0], [3, 0]] },
      { row: 4, column: 0, direction: "across", length: 16, positions: Array.from({ length: 16 }, (_, column) => [4, column]) },
      { row: 6, column: 0, direction: "across", length: 8, positions: Array.from({ length: 8 }, (_, column) => [6, column]) },
    ];
    const words = new Map([
      [3, [{ word: "QAT", score: 5 }, { word: "CAT", score: 4 }]],
      [4, [{ word: "QTES", score: 5 }, { word: "CQXS", score: 4 }]],
      [8, [{ word: "RSTUVWYZ", score: 4 }]],
      [16, [{ word: "ABCDEFGHIJKLMNOP", score: 4 }]],
    ]);
    const filled = await fillSlots(crossingSlots, prepareFill(crossingSlots, indexFillWords(words), true)!, new SeededRandom("alphabet"), { ...options, requireEveryLetter: true }, 100);
    expect(filled?.entries.map(({ word }) => word)).toEqual(["CAT", "CQXS", "ABCDEFGHIJKLMNOP", "RSTUVWYZ"]);
  });

  it("rejects a lost rare letter after propagating crossings", () => {
    const dictionary = indexFillWords(new Map([
      [3, [{ word: "QAB", score: 5 }, { word: "CAP", score: 5 }, { word: "ABE", score: 5 }]],
      [8, [{ word: "AWCDXYZS", score: 5 }]],
      [16, [{ word: "EFGHIJKLMNOPRTUV", score: 5 }]],
    ]));
    const across = { ...slots[0], positions: [[0, 0], [0, 1], [0, 2]] as LayoutSlot["positions"] };
    const down: LayoutSlot = { row: 0, column: 0, direction: "down", length: 8,
      positions: Array.from({ length: 8 }, (_, row) => [row, 0]) };
    const long: LayoutSlot = { row: 9, column: 0, direction: "across", length: 16,
      positions: Array.from({ length: 16 }, (_, column) => [9, column]) };
    expect(prepareFill([across, down, long], dictionary, false)).not.toBeNull();
    expect(prepareFill([across, down, long], dictionary, true)).toBeNull();
  });

  it("rejects competing slots whose propagated domains share too few distinct words", () => {
    const dictionary = indexFillWords(new Map([
      [3, [{ word: "CAT", score: 5 }, { word: "CAR", score: 5 }, { word: "DOG", score: 5 }]],
      [4, [{ word: "CCCC", score: 5 }]],
    ]));
    const across: LayoutSlot[] = [0, 1, 2].map((row) => ({ row, column: 0, direction: "across", length: 3,
      positions: [[row, 0], [row, 1], [row, 2]] }));
    const down: LayoutSlot = { row: 0, column: 0, direction: "down", length: 4, positions: [[0, 0], [1, 0], [2, 0], [3, 0]] };
    expect(prepareFill([...across, down], dictionary, false)).toBeNull();
  });

  it("returns null when the fixed node budget is exhausted", async () => {
    const words = new Map([[3, [{ word: "CAT", score: 5 }, { word: "ARE", score: 4 }]]]);
    expect(await fillSlots(slots, prepareFill(slots, indexFillWords(words), false)!, new SeededRandom("budget"), options, 0)).toBeNull();
  });
});
