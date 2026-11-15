import type { Entry } from "../types";
import { SeededRandom } from "./random";

export const GRID_WIDTH = 17;
export const GRID_HEIGHT = 20;
export type BlockMask = boolean[][]; // true is a block

export interface LayoutProfile {
  blocks: readonly [number, number];
  words: readonly [number, number];
  targetBlocks: number;
  targetWords: number;
}

export const LAYOUT_PROFILES: Record<"interactive" | "booklet", LayoutProfile> = {
  interactive: { blocks: [119, 136], words: [45, 55], targetBlocks: 127, targetWords: 50 },
  booklet: { blocks: [100, 115], words: [50, 58], targetBlocks: 108, targetWords: 55 },
};

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

export interface MaskScore {
  score: number;
  blocks: number;
  slots: LayoutSlot[];
  distribution: { short: number; medium: number; long: number };
  valid: boolean;
}

export function scoreBlockMask(mask: BlockMask, profile: LayoutProfile, availableByLength: ReadonlyMap<number, number>): MaskScore {
  const blocks = mask.flat().filter(Boolean).length;
  const slots = extractSlots(mask);
  const covered = new Set(slots.flatMap((slot) => slot.positions.map(([row, column]) => `${row},${column}`)));
  const open = GRID_WIDTH * GRID_HEIGHT - blocks;
  const connected = connectedOpenCells(mask);
  const twoCellRuns = countTwoCellRuns(mask);
  const blockClusters = blockClusterSizes(mask);
  const oversizedBlockCells = blockClusters.reduce((sum, size) => sum + Math.max(0, size - 3), 0);
  const openThreeByThreeAreas = countOpenThreeByThreeAreas(mask);
  const oversizedOpenAreas = countOpenAreasLargerThanTwoByTwo(mask);
  let unusable = 0;
  for (let row = 0; row < GRID_HEIGHT; row += 1) for (let column = 0; column < GRID_WIDTH; column += 1) if (!mask[row][column] && !covered.has(`${row},${column}`)) unusable += 1;
  const required = new Map<number, number>();
  for (const slot of slots) required.set(slot.length, (required.get(slot.length) ?? 0) + 1);
  let unavailable = 0;
  let scarcity = 0;
  for (const [length, count] of required) unavailable += Math.max(0, count - (availableByLength.get(length) ?? 0));
  for (const slot of slots) scarcity += 1 / Math.max(1, availableByLength.get(slot.length) ?? 0);
  const distribution = lengthDistribution(slots);
  const usage = new Map<string, number>();
  for (const slot of slots) for (const [row, column] of slot.positions) usage.set(`${row},${column}`, (usage.get(`${row},${column}`) ?? 0) + 1);
  let constrainedCrossings = 0;
  for (const slot of slots) {
    const crossings = slot.positions.filter(([row, column]) => (usage.get(`${row},${column}`) ?? 0) > 1).length;
    constrainedCrossings += Math.max(0, crossings - (slot.length <= 5 ? 1 : slot.length <= 9 ? 3 : 6)) * (slot.length <= 5 ? 18 : 5);
  }
  const targetShort = slots.length * 0.5, targetMedium = slots.length * 0.4, targetLong = slots.length * 0.1;
  const outside = (value: number, [minimum, maximum]: readonly [number, number]) => value < minimum ? minimum - value : value > maximum ? value - maximum : 0;
  const score = outside(blocks, profile.blocks) * 60 + Math.abs(blocks - profile.targetBlocks) * 2
    + outside(slots.length, profile.words) * 100 + Math.abs(slots.length - profile.targetWords) * 4
    + Math.abs(distribution.short - targetShort) * 5 + Math.abs(distribution.medium - targetMedium) * 4 + Math.abs(distribution.long - targetLong) * 3
    + unusable * 500 + twoCellRuns * 750 + oversizedBlockCells * 1_000 + openThreeByThreeAreas * 750 + oversizedOpenAreas * 750
    + (open - connected) * 500 + unavailable * 1000 + constrainedCrossings + scarcity * 400;
  const ratios = slots.length ? [distribution.short / slots.length, distribution.medium / slots.length, distribution.long / slots.length] : [0, 0, 0];
  const valid = blocks >= profile.blocks[0] && blocks <= profile.blocks[1]
    && slots.length >= profile.words[0] && slots.length <= profile.words[1]
    && unusable === 0 && twoCellRuns === 0 && oversizedBlockCells === 0 && openThreeByThreeAreas === 0 && oversizedOpenAreas === 0
    && connected === open && unavailable === 0
    && ratios[0] >= 0.35 && ratios[0] <= 0.65 && ratios[1] >= 0.25 && ratios[1] <= 0.55 && ratios[2] >= 0.03 && ratios[2] <= 0.22;
  return { score, blocks, slots, distribution, valid };
}

export function initialBlockMask(random: SeededRandom, target: number): BlockMask {
  const mask = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(false) as boolean[]);
  let blocks = 0;
  let attempts = 0;
  while (blocks < target && attempts < 50_000) {
    attempts += 1;
    let row = random.integer(GRID_HEIGHT), column = random.integer(GRID_WIDTH);
    if (random.next() < 0.45 && blocks > 0) {
      const existing: Array<[number, number]> = [];
      for (let candidateRow = 0; candidateRow < GRID_HEIGHT; candidateRow += 1) for (let candidateColumn = 0; candidateColumn < GRID_WIDTH; candidateColumn += 1) if (mask[candidateRow][candidateColumn]) existing.push([candidateRow, candidateColumn]);
      const [blockRow, blockColumn] = existing[random.integer(existing.length)];
      const [dr, dc] = [[-1, 0], [1, 0], [0, -1], [0, 1]][random.integer(4)];
      row = blockRow + dr; column = blockColumn + dc;
    }
    if (row < 0 || row >= GRID_HEIGHT || column < 0 || column >= GRID_WIDTH || mask[row][column]) continue;
    mask[row][column] = true;
    const open = GRID_WIDTH * GRID_HEIGHT - blocks - 1;
    if (Math.max(...blockClusterSizes(mask)) > 3 || connectedOpenCells(mask) !== open) { mask[row][column] = false; continue; }
    blocks += 1;
  }
  const oversizedArea = (): Array<[number, number]> | undefined => {
    for (let row = 0; row <= GRID_HEIGHT - 2; row += 1) for (let column = 0; column <= GRID_WIDTH - 3; column += 1) {
      const positions = Array.from({ length: 2 }, (_, dr) => Array.from({ length: 3 }, (__, dc) => [row + dr, column + dc] as [number, number])).flat();
      if (positions.every(([cellRow, cellColumn]) => !mask[cellRow][cellColumn])) return positions;
    }
    for (let row = 0; row <= GRID_HEIGHT - 3; row += 1) for (let column = 0; column <= GRID_WIDTH - 2; column += 1) {
      const positions = Array.from({ length: 3 }, (_, dr) => Array.from({ length: 2 }, (__, dc) => [row + dr, column + dc] as [number, number])).flat();
      if (positions.every(([cellRow, cellColumn]) => !mask[cellRow][cellColumn])) return positions;
    }
    return undefined;
  };
  for (let repairs = 0; repairs < 100; repairs += 1) {
    const area = oversizedArea();
    if (!area) break;
    let repaired = false;
    for (const [row, column] of random.shuffle([...area])) {
      mask[row][column] = true;
      const open = GRID_WIDTH * GRID_HEIGHT - mask.flat().filter(Boolean).length;
      if (Math.max(...blockClusterSizes(mask)) <= 3 && connectedOpenCells(mask) === open) { repaired = true; break; }
      mask[row][column] = false;
    }
    if (!repaired) break;
  }
  return mask;
}

export function generateBlockMask(random: SeededRandom, profile: LayoutProfile, availableByLength: ReadonlyMap<number, number>, iterations = 18_000, acceptsSlots?: (slots: LayoutSlot[]) => boolean): { mask: BlockMask; assessment: MaskScore } | null {
  let mask = initialBlockMask(random, profile.targetBlocks);
  const hardScore = (candidate: BlockMask) => {
    const blocks = candidate.flat().filter(Boolean).length;
    const open = GRID_WIDTH * GRID_HEIGHT - blocks;
    const oversizedBlocks = blockClusterSizes(candidate).reduce((sum, size) => sum + Math.max(0, size - 3), 0);
    const outsideBlocks = blocks < profile.blocks[0] ? profile.blocks[0] - blocks : blocks > profile.blocks[1] ? blocks - profile.blocks[1] : 0;
    return countTwoCellRuns(candidate) * 100 + countOpenAreasLargerThanTwoByTwo(candidate) * 100
      + oversizedBlocks * 200 + (open - connectedOpenCells(candidate)) * 200 + outsideBlocks * 50;
  };
  let geometryScore = hardScore(mask);
  for (let iteration = 0; iteration < 24_000 && geometryScore > 0; iteration += 1) {
    const blocks: Array<[number, number]> = [], open: Array<[number, number]> = [];
    for (let row = 0; row < GRID_HEIGHT; row += 1) for (let column = 0; column < GRID_WIDTH; column += 1) (mask[row][column] ? blocks : open).push([row, column]);
    const changes: Array<[number, number]> = random.next() < 0.85
      ? [blocks[random.integer(blocks.length)], open[random.integer(open.length)]]
      : [[random.integer(GRID_HEIGHT), random.integer(GRID_WIDTH)]];
    for (const [row, column] of changes) mask[row][column] = !mask[row][column];
    const candidateScore = hardScore(mask);
    const temperature = Math.max(0.1, 20 * (1 - iteration / 24_000));
    if (candidateScore <= geometryScore || random.next() < Math.exp((geometryScore - candidateScore) / temperature)) geometryScore = candidateScore;
    else for (const [row, column] of changes) mask[row][column] = !mask[row][column];
  }
  if (geometryScore > 0) return null;
  let assessment = scoreBlockMask(mask, profile, availableByLength);
  let bestMask = mask.map((row) => [...row]), best = assessment;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const changes: Array<[number, number]> = [];
    if (random.next() < 0.45) {
      const blocks: Array<[number, number]> = [], open: Array<[number, number]> = [];
      for (let row = 0; row < GRID_HEIGHT; row += 1) for (let column = 0; column < GRID_WIDTH; column += 1) (mask[row][column] ? blocks : open).push([row, column]);
      changes.push(blocks[random.integer(blocks.length)], open[random.integer(open.length)]);
    } else changes.push([random.integer(GRID_HEIGHT), random.integer(GRID_WIDTH)]);
    for (const [row, column] of changes) mask[row][column] = !mask[row][column];
    const candidate = scoreBlockMask(mask, profile, availableByLength);
    const temperature = Math.max(0.05, 12 * (1 - iteration / iterations));
    if (candidate.score <= assessment.score || random.next() < Math.exp((assessment.score - candidate.score) / temperature)) assessment = candidate;
    else for (const [row, column] of changes) mask[row][column] = !mask[row][column];
    if (assessment.score < best.score) { best = assessment; bestMask = mask.map((line) => [...line]); }
    if (assessment.valid && iteration > 2_500 && (!acceptsSlots || acceptsSlots(assessment.slots))) return { mask: mask.map((line) => [...line]), assessment };
  }
  return best.valid && (!acceptsSlots || acceptsSlots(best.slots)) ? { mask: bestMask, assessment: best } : null;
}
