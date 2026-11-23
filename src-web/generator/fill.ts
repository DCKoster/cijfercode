import type { Entry, GenerationOptions, LetterCell } from "../types";
import { SeededRandom } from "./random";
import { generationSlice } from "./slice";
import { GRID_HEIGHT, GRID_WIDTH, type LayoutSlot } from "./layout";

export interface FillWord { word: string; score: number }
export interface FillResult { grid: LetterCell[][]; entries: Entry[]; nodes: number }

const ALPHABET = (1 << 26) - 1;
type Candidate = FillWord & { letters: number[]; mask: number };
type Domains = Candidate[][];
interface Crossing { position: number; other: number; otherPosition: number }

export interface FillDictionary {
  domains: ReadonlyMap<number, Candidate[]>;
  available: ReadonlyMap<number, number>;
  positions: number[][];
  counts: Uint32Array[][];
  rare: number;
}

export function indexFillWords(wordsByLength: ReadonlyMap<number, FillWord[]>): FillDictionary {
  const domains = new Map<number, Candidate[]>();
  const counts: Uint32Array[][] = [];
  const positions: number[][] = [];
  const letterCounts = new Uint32Array(26);
  let total = 0;
  for (let length = 3; length <= GRID_HEIGHT; length += 1) {
    const seen = new Set<string>();
    counts[length] = Array.from({ length }, () => new Uint32Array(26));
    positions[length] = Array(length).fill(0);
    const candidates: Candidate[] = [];
    for (const { word, score } of wordsByLength.get(length) ?? []) {
      if (word.length !== length || !/^[A-Z]+$/.test(word) || seen.has(word)) continue;
      seen.add(word);
      const letters = Array.from(word, (letter) => letter.charCodeAt(0) - 65);
      let mask = 0;
      for (const [position, letter] of letters.entries()) {
        const bit = 1 << letter;
        counts[length][position][letter] += 1;
        positions[length][position] |= bit;
        mask |= bit;
      }
      for (let bits = mask; bits; bits &= bits - 1) letterCounts[31 - Math.clz32(bits & -bits)] += 1;
      candidates.push({ word, score, letters, mask });
    }
    total += candidates.length;
    domains.set(length, candidates);
  }
  let rare = 0;
  for (const [letter, count] of letterCounts.entries()) {
    if (count <= total * 0.08) rare |= 1 << letter;
  }
  return { domains, available: new Map(Array.from(domains, ([length, words]) => [length, words.length])), positions, counts, rare };
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

function propagate(domains: Domains, crossings: Crossing[][], slotsByLength: number[][], changed: number[], conflicts?: Set<number>): boolean {
  const queued = new Uint8Array(domains.length);
  for (const slot of changed) queued[slot] = 1;
  const queue = [...changed];
  const update = (slot: number, domain: Candidate[]) => {
    if (!domain.length) {
      if (!conflicts) return false;
      conflicts.add(slot);
      return true;
    }
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
    if (!domain.length) {
      if (!conflicts) return false;
      conflicts.add(slot);
      continue;
    }
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

function distinctWordsPossible(domains: Domains, groups: number[][]): boolean {
  for (const group of groups) {
    // At most group.length - 1 words can be claimed by other slots.
    const scarce = group.filter((slot) => domains[slot].length < group.length)
      .sort((left, right) => domains[left].length - domains[right].length);
    const assigned = new Map<string, number>();
    const assign = (slot: number, seen: Set<string>): boolean => {
      for (const { word } of domains[slot]) {
        if (seen.has(word)) continue;
        seen.add(word);
        const other = assigned.get(word);
        if (other === undefined || assign(other, seen)) {
          assigned.set(word, slot);
          return true;
        }
      }
      return false;
    };
    if (!scarce.every((slot) => assign(slot, new Set()))) return false;
  }
  return true;
}

function supportedLetters(domains: Domains): number {
  let supported = 0;
  for (const domain of domains) for (const { mask } of domain) {
    supported |= mask;
    if (supported === ALPHABET) return supported;
  }
  return supported;
}

export function fillPenalty(slots: LayoutSlot[], dictionary: FillDictionary, requireEveryLetter: boolean) {
  const domains = slots.map(({ length }) => dictionary.domains.get(length) ?? []);
  const crossings = slotCrossings(slots);
  const slotsByLength = groupSlotsByLength(slots);
  const conflicts = new Set<number>();
  propagate(domains, crossings, slotsByLength, slots.map((_, index) => index), conflicts);
  let cost = 0;
  if (requireEveryLetter) {
    const supported = supportedLetters(domains);
    for (let missing = ALPHABET & ~supported; missing; missing &= missing - 1) cost += 14;
  }
  const cells = [...conflicts].flatMap((slot) => slots[slot].positions.map(([row, column]) => row * GRID_WIDTH + column));
  return { cost: conflicts.size * 5 + cost + (distinctWordsPossible(domains, slotsByLength) ? 0 : 8), cells };
}

export function prepareFill(slots: LayoutSlot[], dictionary: FillDictionary, requireEveryLetter: boolean) {
  const domains = slots.map(({ length }) => dictionary.domains.get(length) ?? []);
  const crossings = slotCrossings(slots);
  const slotsByLength = groupSlotsByLength(slots);
  if (!propagate(domains, crossings, slotsByLength, slots.map((_, index) => index))
    || (requireEveryLetter && supportedLetters(domains) !== ALPHABET)
    || !distinctWordsPossible(domains, slotsByLength)) return null;
  if (requireEveryLetter && !rarePlacementsPossible(domains, crossings, slotsByLength, dictionary.rare)) return null;
  return { domains, crossings, slotsByLength };
}

function rarePlacementsPossible(domains: Domains, crossings: Crossing[][], slotsByLength: number[][], rare: number): boolean {
  const placements: Array<Array<[number, Candidate]>> = Array.from({ length: 26 }, () => []);
  for (const [slot, domain] of domains.entries()) {
    for (const candidate of domain) {
      for (let bits = candidate.mask & rare; bits; bits &= bits - 1) {
        const candidates = placements[31 - Math.clz32(bits & -bits)];
        if (candidates.length <= 6) candidates.push([slot, candidate]);
      }
    }
  }
  const tightest = placements.filter((placed) => placed.length > 0 && placed.length <= 6)
    .sort((left, right) => left.length - right.length)[0];
  // Each of these branches is necessary to place the rarest letter.
  return !tightest || tightest.some(([slot, candidate]) => {
    const branch = [...domains];
    branch[slot] = [candidate];
    return propagate(branch, crossings, slotsByLength, [slot])
      && supportedLetters(branch) === ALPHABET && distinctWordsPossible(branch, slotsByLength);
  });
}

export async function fillSlots(
  slots: LayoutSlot[],
  prepared: NonNullable<ReturnType<typeof prepareFill>>,
  random: SeededRandom,
  options: GenerationOptions,
  nodeBudget: number,
  cancelled?: () => boolean,
  diversity?: { answerFrequency: ReadonlyMap<string, number>; acceptsAnswers: (words: string[]) => boolean },
): Promise<FillResult | null> {
  const { domains, crossings, slotsByLength } = prepared;
  const slice = generationSlice(cancelled);
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
    const pause = slice();
    if (pause) await pause;
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
    if (choice < 0) {
      if (missing || (diversity && !diversity.acceptsAnswers(current.map(([candidate]) => candidate.word)))) return null;
      return current;
    }

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
        if (diversity) priority -= 2 * Math.log1p(diversity.answerFrequency.get(candidate.word) ?? 0);
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
      if ((nodes & 15) === 0) {
        const pause = slice();
        if (pause) await pause;
      }
      const next = [...current];
      next[slot] = [candidate];
      if (!propagate(next, crossings, slotsByLength, [slot]) || !distinctWordsPossible(next, slotsByLength)) continue;
      const filled = await search(next);
      if (filled) return filled;
    }
    return null;
  };

  if (cancelled?.()) throw new Error("Geannuleerd");
  if (nodeBudget < 1) return null;
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
