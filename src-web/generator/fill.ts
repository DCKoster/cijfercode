import type { Entry, GenerationOptions, LetterCell } from "../types";
import { SeededRandom } from "./random";
import type { LayoutSlot } from "./layout";

export interface FillWord { word: string; score: number }
export interface FillResult { grid: LetterCell[][]; entries: Entry[]; nodes: number; exhausted: boolean }

export function hasArcConsistentDomains(slots: LayoutSlot[], wordsByLength: ReadonlyMap<number, FillWord[]>): boolean {
  const domains = slots.map((slot) => [...(wordsByLength.get(slot.length) ?? [])]);
  const cells = new Map<string, Array<[number, number]>>();
  for (const [slotIndex, slot] of slots.entries()) for (const [position, [row, column]] of slot.positions.entries()) {
    const key = `${row},${column}`, values = cells.get(key) ?? [];
    values.push([slotIndex, position]); cells.set(key, values);
  }
  const arcs: Array<[number, number, number, number]> = [];
  for (const values of cells.values()) if (values.length === 2) {
    const [[left, leftPosition], [right, rightPosition]] = values;
    arcs.push([left, right, leftPosition, rightPosition], [right, left, rightPosition, leftPosition]);
  }
  let reduced = true;
  while (reduced) {
    reduced = false;
    for (const [from, to, fromPosition, toPosition] of arcs) {
      const supported = new Set(domains[to].map(({ word }) => word[toPosition]));
      const next = domains[from].filter(({ word }) => supported.has(word[fromPosition]));
      if (!next.length) return false;
      if (next.length !== domains[from].length) { domains[from] = next; reduced = true; }
    }
  }
  return true;
}

export async function fillSlots(
  slots: LayoutSlot[],
  wordsByLength: ReadonlyMap<number, FillWord[]>,
  random: SeededRandom,
  options: GenerationOptions,
  nodeBudget: number,
  cancelled?: () => boolean,
): Promise<FillResult | null> {
  const grid: LetterCell[][] = Array.from({ length: 20 }, () => Array(17).fill(null));
  const assigned = Array<string | null>(slots.length).fill(null);
  const used = new Set<string>();
  const usedLetters = new Set<string>();
  const domains = slots.map((slot) => {
    const variation = new Map((wordsByLength.get(slot.length) ?? []).map(({ word }) => [word, random.next()]));
    return [...(wordsByLength.get(slot.length) ?? [])].sort((a, b) => b.score - a.score || variation.get(a.word)! - variation.get(b.word)!);
  });
  const activeDomains = domains.map((domain) => [...domain]);
  const cellSlots = new Map<string, number[]>();
  for (const [slotIndex, slot] of slots.entries()) for (const [row, column] of slot.positions) {
    const key = `${row},${column}`, values = cellSlots.get(key) ?? [];
    values.push(slotIndex); cellSlots.set(key, values);
  }
  const arcs: Array<[number, number, number, number]> = [];
  for (const values of cellSlots.values()) if (values.length === 2) {
    const [left, right] = values;
    const leftPosition = slots[left].positions.findIndex(([row, column]) => slots[right].positions.some(([otherRow, otherColumn]) => row === otherRow && column === otherColumn));
    const [crossRow, crossColumn] = slots[left].positions[leftPosition];
    const rightPosition = slots[right].positions.findIndex(([row, column]) => row === crossRow && column === crossColumn);
    arcs.push([left, right, leftPosition, rightPosition], [right, left, rightPosition, leftPosition]);
  }
  let reduced = true;
  while (reduced) {
    reduced = false;
    for (const [from, to, fromPosition, toPosition] of arcs) {
      const supported = new Set(activeDomains[to].map(({ word }) => word[toPosition]));
      const next = activeDomains[from].filter(({ word }) => supported.has(word[fromPosition]));
      if (!next.length) return null;
      if (next.length !== activeDomains[from].length) { activeDomains[from] = next; reduced = true; }
    }
  }
  let nodes = 0, exhausted = false;

  const search = async (depth: number): Promise<boolean> => {
    if (cancelled?.()) throw new Error("Geannuleerd");
    if (depth === slots.length) return !options.requireEveryLetter || usedLetters.size === 26;
    let choice = -1, possible: FillWord[] = [];
    const requiredLetter = options.requireEveryLetter ? [..."QXCYFJZWVKBPHDGMOULNTRSAEI"].find((letter) => !usedLetters.has(letter)) : undefined;
    let requiredChoice = -1, requiredWords: FillWord[] = [];
    for (let index = 0; index < slots.length; index += 1) {
      if (assigned[index] !== null) continue;
      const candidates = activeDomains[index].filter(({ word }) => !used.has(word));
      if (!candidates.length) return false;
      if (choice < 0 || candidates.length < possible.length) { choice = index; possible = candidates; }
      if (requiredLetter) {
        const covering = candidates.filter(({ word }) => word.includes(requiredLetter));
        if (covering.length && (requiredChoice < 0 || covering.length < requiredWords.length)) { requiredChoice = index; requiredWords = covering; }
      }
    }
    if (requiredLetter) {
      if (requiredChoice < 0) return false;
      choice = requiredChoice; possible = requiredWords;
    }
    if (options.requireEveryLetter && usedLetters.size < 26) {
      possible.sort((a, b) => {
        const coverage = (word: string) => new Set([...word].filter((letter) => !usedLetters.has(letter))).size;
        return coverage(b.word) - coverage(a.word) || b.score - a.score;
      });
    }
    const support = new Map<string, number>();
    for (const [position, [row, column]] of slots[choice].positions.entries()) {
      const other = (cellSlots.get(`${row},${column}`) ?? []).find((slotIndex) => slotIndex !== choice && assigned[slotIndex] === null);
      if (other === undefined) continue;
      const otherPosition = slots[other].positions.findIndex(([otherRow, otherColumn]) => otherRow === row && otherColumn === column);
      const counts = new Map<string, number>();
      for (const candidate of activeDomains[other]) if (!used.has(candidate.word)) counts.set(candidate.word[otherPosition], (counts.get(candidate.word[otherPosition]) ?? 0) + 1);
      for (const candidate of possible) support.set(candidate.word, (support.get(candidate.word) ?? 0) + Math.log1p(counts.get(candidate.word[position]) ?? 0));
    }
    const rareWeight: Record<string, number> = { Q: 100, X: 40, Y: 15, C: 8, F: 6, J: 6 };
    const coverage = (word: string) => options.requireEveryLetter ? [...new Set([...word].filter((letter) => !usedLetters.has(letter)))].reduce((sum, letter) => sum + (rareWeight[letter] ?? 1), 0) : 0;
    possible.sort((a, b) => coverage(b.word) - coverage(a.word) || (support.get(b.word) ?? 0) - (support.get(a.word) ?? 0) || b.score - a.score);
    for (const { word } of possible) {
      nodes += 1;
      if (nodes > nodeBudget) { exhausted = true; return false; }
      if ((nodes & 2047) === 0) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); if (cancelled?.()) throw new Error("Geannuleerd"); }
      const changed: Array<[number, number]> = [];
      for (const [position, [row, column]] of slots[choice].positions.entries()) if (grid[row][column] === null) { grid[row][column] = word[position]; changed.push([row, column]); }
      assigned[choice] = word; used.add(word);
      const previousLetters = new Set(usedLetters); for (const letter of word) usedLetters.add(letter);
      const previousDomains = new Map<number, FillWord[]>();
      let viable = true;
      const affected = new Set<number>();
      for (const [row, column] of changed) for (const slotIndex of cellSlots.get(`${row},${column}`) ?? []) if (assigned[slotIndex] === null) affected.add(slotIndex);
      for (const slotIndex of affected) {
        previousDomains.set(slotIndex, activeDomains[slotIndex]);
        activeDomains[slotIndex] = activeDomains[slotIndex].filter(({ word: candidate }) => slots[slotIndex].positions.every(([row, column], position) => grid[row][column] === null || grid[row][column] === candidate[position]));
        if (!activeDomains[slotIndex].length) { viable = false; break; }
      }
      if (viable && await search(depth + 1)) return true;
      assigned[choice] = null; used.delete(word); changed.forEach(([row, column]) => { grid[row][column] = null; });
      previousDomains.forEach((domain, index) => { activeDomains[index] = domain; });
      usedLetters.clear(); previousLetters.forEach((letter) => usedLetters.add(letter));
      if (exhausted) return false;
    }
    return false;
  };
  if (!await search(0)) return null;
  return {
    grid,
    entries: slots.map((slot, index) => ({ row: slot.row, column: slot.column, direction: slot.direction, length: slot.length, word: assigned[index]! })),
    nodes,
    exhausted,
  };
}
