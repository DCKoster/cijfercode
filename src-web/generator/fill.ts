import type { Entry, GenerationOptions, LetterCell } from "../types";
import { SeededRandom } from "./random";
import { GRID_HEIGHT, GRID_WIDTH, type LayoutSlot } from "./layout";

export interface FillWord { word: string; score: number }
export interface FillResult { grid: LetterCell[][]; entries: Entry[]; nodes: number }

const ALPHABET = (1 << 26) - 1;
type Candidate = FillWord & { letters: number[]; mask: number };
type Domains = Candidate[][];
interface Crossing { position: number; other: number; otherPosition: number }

function createDomains(slots: LayoutSlot[], wordsByLength: ReadonlyMap<number, FillWord[]>, random?: SeededRandom): Domains {
  const byLength = new Map<number, Candidate[]>();
  return slots.map((slot) => {
    let domain = byLength.get(slot.length);
    if (!domain) {
      const words = wordsByLength.get(slot.length) ?? [];
      const ordered = random ? random.shuffle([...words]) : words;
      domain = ordered.map(({ word, score }) => {
        const letters = Array.from(word, (letter) => letter.charCodeAt(0) - 65);
        return { word, score, letters, mask: letters.reduce((mask, letter) => mask | (1 << letter), 0) };
      });
      byLength.set(slot.length, domain);
    }
    return domain;
  });
}

function slotCrossings(slots: LayoutSlot[]): Crossing[][] {
  const crossings = slots.map(() => [] as Crossing[]);
  const cells = new Map<number, { slot: number; position: number }>();
  for (const [slot, entry] of slots.entries()) {
    for (const [position, [row, column]] of entry.positions.entries()) {
      const cell = row * GRID_WIDTH + column;
      const first = cells.get(cell);
      if (first) {
        crossings[slot].push({ position, other: first.slot, otherPosition: first.position });
        crossings[first.slot].push({ position: first.position, other: slot, otherPosition: position });
      } else {
        cells.set(cell, { slot, position });
      }
    }
  }
  return crossings;
}

function propagate(domains: Domains, crossings: Crossing[][], slotsByLength: number[][], changed: number[]): boolean {
  const queued = new Uint8Array(domains.length);
  for (const slot of changed) queued[slot] = 1;
  const queue = [...changed];
  const update = (slot: number, domain: Candidate[]) => {
    if (!domain.length) return false;
    if (domain.length === domains[slot].length) return true;
    domains[slot] = domain;
    if (!queued[slot]) {
      queue.push(slot);
      queued[slot] = 1;
    }
    return true;
  };
  for (let index = 0; index < queue.length; index += 1) {
    const slot = queue[index];
    queued[slot] = 0;
    const domain = domains[slot];
    if (!domain.length) return false;
    if (domain.length === 1) {
      const word = domain[0].word;
      for (const other of slotsByLength[domain[0].letters.length]) {
        if (other !== slot && !update(other, domains[other].filter((candidate) => candidate.word !== word))) return false;
      }
    }
    for (const { position, other, otherPosition } of crossings[slot]) {
      let supported = 0;
      for (const candidate of domain) supported |= 1 << candidate.letters[position];
      if (supported === ALPHABET) continue;
      if (!update(other, domains[other].filter((candidate) => supported & (1 << candidate.letters[otherPosition])))) return false;
    }
  }
  return true;
}

function groupSlotsByLength(slots: LayoutSlot[]): number[][] {
  const groups: number[][] = Array.from({ length: Math.max(GRID_WIDTH, GRID_HEIGHT) + 1 }, () => []);
  for (const [index, slot] of slots.entries()) groups[slot.length].push(index);
  return groups;
}

export async function fillSlots(
  slots: LayoutSlot[],
  wordsByLength: ReadonlyMap<number, FillWord[]>,
  random: SeededRandom,
  options: GenerationOptions,
  nodeBudget: number,
  cancelled?: () => boolean,
): Promise<FillResult | null> {
  const domains = createDomains(slots, wordsByLength, random);
  const crossings = slotCrossings(slots);
  const slotsByLength = groupSlotsByLength(slots);
  let nodes = 0;
  const letterCounts = new WeakMap<Candidate[], Uint16Array>();
  const countLetters = (domain: Candidate[]): Uint16Array => {
    const cached = letterCounts.get(domain);
    if (cached) return cached;
    const counts = new Uint16Array(26);
    for (const candidate of domain) {
      for (let mask = candidate.mask; mask; mask &= mask - 1) {
        counts[31 - Math.clz32(mask & -mask)] += 1;
      }
    }
    letterCounts.set(domain, counts);
    return counts;
  };

  const search = async (current: Domains): Promise<Domains | null> => {
    let choice = -1;
    let present = 0;
    const unfilled: number[] = [];
    for (const [slot, domain] of current.entries()) {
      if (domain.length === 1) {
        present |= domain[0].mask;
      } else {
        unfilled.push(slot);
        const best = current[choice];
        if (!best || domain.length < best.length
          || (domain.length === best.length && crossings[slot].length > crossings[choice].length)) {
          choice = slot;
        }
      }
    }
    const missing = options.requireEveryLetter ? ALPHABET & ~present : 0;
    if (choice < 0) return missing ? null : current;

    let required = 0;
    if (missing) {
      const counts = new Uint32Array(26);
      for (const slot of unfilled) {
        const supported = countLetters(current[slot]);
        for (let mask = missing; mask; mask &= mask - 1) {
          const letter = 31 - Math.clz32(mask & -mask);
          counts[letter] += supported[letter];
        }
      }
      // The rarest missing letter may have viable placements in several slots.
      let fewest = Math.max(16, current[choice].length);
      for (let mask = missing; mask; mask &= mask - 1) {
        const bit = mask & -mask;
        const count = counts[31 - Math.clz32(bit)];
        if (!count) return null;
        if (count <= fewest) {
          required = bit;
          fewest = count;
        }
      }
    }

    const choices = required ? unfilled : [choice];
    const placements = choices.flatMap((slot) => {
      const words = required ? current[slot].filter((candidate) => candidate.mask & required) : current[slot];
      if (!words.length) return [];
      const support = crossings[slot].map(({ other, otherPosition }) => {
        const counts = new Uint16Array(26);
        for (const candidate of current[other]) counts[candidate.letters[otherPosition]] += 1;
        return counts;
      });
      return words.map((candidate) => {
        let priority = candidate.score + random.next();
        for (let mask = candidate.mask & missing; mask; mask &= mask - 1) priority += 2;
        for (const [index, { position }] of crossings[slot].entries()) {
          priority += Math.log(support[index][candidate.letters[position]] / current[crossings[slot][index].other].length);
        }
        return { slot, candidate, priority };
      });
    }).sort((a, b) => b.priority - a.priority);

    for (const { slot, candidate } of placements) {
      if (nodes >= nodeBudget) return null;
      nodes += 1;
      if ((nodes & 255) === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (cancelled?.()) throw new Error("Geannuleerd");
      }
      const next = [...current];
      next[slot] = [candidate];
      if (!propagate(next, crossings, slotsByLength, [slot])) continue;
      const filled = await search(next);
      if (filled) return filled;
    }
    return null;
  };

  if (cancelled?.()) throw new Error("Geannuleerd");
  if (nodeBudget < 1 || !propagate(domains, crossings, slotsByLength, slots.map((_, index) => index))) return null;
  const filled = await search(domains);
  if (!filled) return null;
  const grid: LetterCell[][] = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(null));
  const entries: Entry[] = slots.map(({ positions, ...slot }, index) => {
    const { word } = filled[index][0];
    for (const [position, [row, column]] of positions.entries()) grid[row][column] = word[position];
    return { ...slot, word };
  });
  return { grid, entries, nodes };
}
