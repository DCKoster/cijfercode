import type { Entry, GenerationOptions } from "../types";
import { LAYOUT_TEMPLATES } from "./layoutTemplates";
import { SeededRandom } from "./random";

export const GRID_WIDTH = 17;
export const GRID_HEIGHT = 20;
export type BlockMask = boolean[][]; // true is a block

export interface LayoutProfile {
  blocks: readonly [number, number];
  words: readonly [number, number];
}

export const LAYOUT_PROFILES = {
  interactive: { blocks: [119, 136], words: [45, 55] },
  booklet: { blocks: [100, 115], words: [50, 58] },
  animalBooklet: { blocks: [100, 132], words: [47, 58] },
} satisfies Record<string, LayoutProfile>;

export interface LayoutSlot extends Omit<Entry, "word"> { positions: Array<[number, number]> }

export function extractSlots(mask: BlockMask): LayoutSlot[] {
  const slots: LayoutSlot[] = [];
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let column = 0; column < GRID_WIDTH;) {
      if (!mask[row][column] && (column === 0 || mask[row][column - 1])) {
        let end = column;
        while (end < GRID_WIDTH && !mask[row][end]) end += 1;
        if (end - column >= 3) slots.push({ row, column, direction: "across", length: end - column, positions: Array.from({ length: end - column }, (_, offset) => [row, column + offset]) });
        column = end;
      } else column += 1;
    }
  }
  for (let column = 0; column < GRID_WIDTH; column += 1) {
    for (let row = 0; row < GRID_HEIGHT;) {
      if (!mask[row][column] && (row === 0 || mask[row - 1][column])) {
        let end = row;
        while (end < GRID_HEIGHT && !mask[end][column]) end += 1;
        if (end - row >= 3) slots.push({ row, column, direction: "down", length: end - row, positions: Array.from({ length: end - row }, (_, offset) => [row + offset, column]) });
        row = end;
      } else row += 1;
    }
  }
  return slots;
}

export function countTwoCellRuns(mask: BlockMask): number {
  let count = 0;
  const countLine = (length: number, blocked: (index: number) => boolean) => {
    for (let start = 0; start < length;) {
      if (blocked(start)) { start += 1; continue; }
      let end = start;
      while (end < length && !blocked(end)) end += 1;
      if (end - start === 2) count += 1;
      start = end;
    }
  };
  for (let row = 0; row < GRID_HEIGHT; row += 1) countLine(GRID_WIDTH, (column) => mask[row][column]);
  for (let column = 0; column < GRID_WIDTH; column += 1) countLine(GRID_HEIGHT, (row) => mask[row][column]);
  return count;
}

export function blockClusterSizes(mask: BlockMask): number[] {
  const seen = new Set<string>();
  const sizes: number[] = [];
  for (let row = 0; row < GRID_HEIGHT; row += 1) for (let column = 0; column < GRID_WIDTH; column += 1) {
    const startKey = `${row},${column}`;
    if (!mask[row][column] || seen.has(startKey)) continue;
    seen.add(startKey);
    const queue: Array<[number, number]> = [[row, column]];
    for (let index = 0; index < queue.length; index += 1) {
      const [currentRow, currentColumn] = queue[index];
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nextRow = currentRow + dr, nextColumn = currentColumn + dc, key = `${nextRow},${nextColumn}`;
        if (nextRow >= 0 && nextRow < GRID_HEIGHT && nextColumn >= 0 && nextColumn < GRID_WIDTH && mask[nextRow][nextColumn] && !seen.has(key)) {
          seen.add(key); queue.push([nextRow, nextColumn]);
        }
      }
    }
    sizes.push(queue.length);
  }
  return sizes;
}

export function countOpenThreeByThreeAreas(mask: BlockMask): number {
  let count = 0;
  for (let row = 0; row <= GRID_HEIGHT - 3; row += 1) {
    for (let column = 0; column <= GRID_WIDTH - 3; column += 1) {
      let fullyOpen = true;
      for (let dr = 0; dr < 3 && fullyOpen; dr += 1) {
        for (let dc = 0; dc < 3; dc += 1) if (mask[row + dr][column + dc]) { fullyOpen = false; break; }
      }
      if (fullyOpen) count += 1;
    }
  }
  return count;
}

export function countOpenAreasLargerThanTwoByTwo(mask: BlockMask): number {
  let count = 0;
  const fullyOpen = (row: number, column: number, height: number, width: number) => {
    for (let dr = 0; dr < height; dr += 1) for (let dc = 0; dc < width; dc += 1) if (mask[row + dr][column + dc]) return false;
    return true;
  };
  for (let row = 0; row <= GRID_HEIGHT - 2; row += 1) {
    for (let column = 0; column <= GRID_WIDTH - 3; column += 1) if (fullyOpen(row, column, 2, 3)) count += 1;
  }
  for (let row = 0; row <= GRID_HEIGHT - 3; row += 1) {
    for (let column = 0; column <= GRID_WIDTH - 2; column += 1) if (fullyOpen(row, column, 3, 2)) count += 1;
  }
  return count;
}

export function connectedOpenCells(mask: BlockMask): number {
  let start: [number, number] | undefined;
  let open = 0;
  for (let row = 0; row < GRID_HEIGHT; row += 1) for (let column = 0; column < GRID_WIDTH; column += 1) {
    if (!mask[row][column]) { open += 1; start ??= [row, column]; }
  }
  if (!start) return 0;
  const seen = new Set([start.join(",")]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const [row, column] = queue[index];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nextRow = row + dr, nextColumn = column + dc, key = `${nextRow},${nextColumn}`;
      if (nextRow >= 0 && nextRow < GRID_HEIGHT && nextColumn >= 0 && nextColumn < GRID_WIDTH && !mask[nextRow][nextColumn] && !seen.has(key)) {
        seen.add(key); queue.push([nextRow, nextColumn]);
      }
    }
  }
  return seen.size === open ? open : seen.size;
}

export function lengthDistribution(slots: Array<Pick<LayoutSlot, "length">>): { short: number; medium: number; long: number } {
  const result = { short: 0, medium: 0, long: 0 };
  for (const slot of slots) result[slot.length <= 5 ? "short" : slot.length <= 9 ? "medium" : "long"] += 1;
  return result;
}

export function assessBlockMask(mask: BlockMask, profile: LayoutProfile, availableByLength: ReadonlyMap<number, number>) {
  const blocks = mask.flat().filter(Boolean).length;
  const slots = extractSlots(mask);
  const distribution = lengthDistribution(slots);
  const open = GRID_WIDTH * GRID_HEIGHT - blocks;
  const covered = new Set<number>();
  const required = new Map<number, number>();
  for (const slot of slots) {
    required.set(slot.length, (required.get(slot.length) ?? 0) + 1);
    for (const [row, column] of slot.positions) covered.add(row * GRID_WIDTH + column);
  }
  const [short, medium, long] = [distribution.short, distribution.medium, distribution.long].map((count) => count / slots.length);
  const valid = blocks >= profile.blocks[0] && blocks <= profile.blocks[1]
    && slots.length >= profile.words[0] && slots.length <= profile.words[1]
    && short >= 0.35 && short <= 0.65 && medium >= 0.25 && medium <= 0.55 && long >= 0.03 && long <= 0.22
    && covered.size === open
    && Array.from(required).every(([length, count]) => count <= (availableByLength.get(length) ?? 0))
    && countTwoCellRuns(mask) === 0
    && countOpenAreasLargerThanTwoByTwo(mask) === 0
    && blockClusterSizes(mask).every((size) => size <= 3)
    && connectedOpenCells(mask) === open;
  return { blocks, slots, distribution, valid };
}

const REFLECTIONS = [[false, false], [true, false], [false, true], [true, true]] as const;

export function puzzleLayouts(
  random: SeededRandom,
  { theme, generationMode }: GenerationOptions,
  availableByLength: ReadonlyMap<number, number>,
) {
  const groups = [{ profile: LAYOUT_PROFILES[generationMode], templates: LAYOUT_TEMPLATES[generationMode][theme] }];
  if (generationMode === "booklet" && theme !== "general") {
    groups[0].profile = LAYOUT_PROFILES.animalBooklet;
    groups.push({ profile: LAYOUT_PROFILES.interactive, templates: LAYOUT_TEMPLATES.interactive[theme] });
  }
  const maximum = groups.reduce((total, { templates }) => total + templates.length * REFLECTIONS.length * 2, 0);

  function* layouts(): Generator<LayoutSlot[]> {
    const seen = new Set<string>();
    const isNew = (mask: BlockMask) => {
      const key = mask.map((row) => row.map(Number).join("")).join("");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    };
    for (const { profile, templates } of groups) {
      for (const template of random.shuffle([...templates])) {
        const rows = template.trim().split(/\s+/);
        // The animal dictionaries fit the original orientation more often.
        const reflections = theme === "general"
          ? random.shuffle([...REFLECTIONS])
          : [REFLECTIONS[0], ...random.shuffle(REFLECTIONS.slice(1))];
        for (const [flipRows, flipColumns] of reflections) {
          const mask = (flipRows ? [...rows].reverse() : rows).map((row) => {
            const cells = Array.from(row, (cell) => cell === "#");
            return flipColumns ? cells.reverse() : cells;
          });
          const base = assessBlockMask(mask, profile, availableByLength);
          // Change a few blocks while keeping the layout constraints.
          const variant = mask.map((row) => [...row]);
          let assessment = base;
          for (let edit = 0; edit < 10; edit += 1) {
            const row = random.integer(GRID_HEIGHT), column = random.integer(GRID_WIDTH);
            variant[row][column] = !variant[row][column];
            const next = assessBlockMask(variant, profile, availableByLength);
            if (next.valid) assessment = next;
            else variant[row][column] = !variant[row][column];
          }
          if (assessment.valid && isNew(variant)) yield assessment.slots;
          if (base.valid && isNew(mask)) yield base.slots;
        }
      }
    }
  }

  return { maximum, layouts: layouts() };
}
