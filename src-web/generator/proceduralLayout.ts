import { fillPenalty, type FillDictionary } from "./fill";
import { acceptsLayout, assessBlockMask, extractSlots, GRID_HEIGHT, GRID_WIDTH, layoutPattern, type LayoutProfile, type LayoutSlot } from "./layout";
import { SeededRandom } from "./random";

export const PROCEDURAL_RESTARTS = 16;
export const MASK_EDITS = 12_000;
export const FILLS_PER_RESTART = 4;
export const TEMPLATE_ATTEMPTS = 24;

const CELL_COUNT = GRID_HEIGHT * GRID_WIDTH;
// A run position encodes its length and zero-based offset. Zero denotes no entry.
const POSITION_STRIDE = GRID_HEIGHT;
const POSITION_COUNT = (GRID_HEIGHT + 1) * POSITION_STRIDE;
const ALL_COLUMNS = (1 << GRID_WIDTH) - 1;
const CELLS = Array.from({ length: CELL_COUNT }, (_, cell) => cell);
const ROWS = CELLS.map((cell) => Math.floor(cell / GRID_WIDTH));
const COLUMNS = CELLS.map((cell) => cell % GRID_WIDTH);
const NEIGHBORS = CELLS.map((cell) => [
  ...(ROWS[cell] ? [cell - GRID_WIDTH] : []),
  ...(ROWS[cell] + 1 < GRID_HEIGHT ? [cell + GRID_WIDTH] : []),
  ...(COLUMNS[cell] ? [cell - 1] : []),
  ...(COLUMNS[cell] + 1 < GRID_WIDTH ? [cell + 1] : []),
]);
const outside = (value: number, low: number, high: number) => Math.max(0, low - value, value - high);
const popcount = (bits: number) => {
  bits -= (bits >>> 1) & 0x55555555;
  bits = (bits & 0x33333333) + ((bits >>> 2) & 0x33333333);
  return Math.imul((bits + (bits >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
};

export function layoutDictionaryScores(dictionary: FillDictionary, requireEveryLetter: boolean, guideDomains: boolean) {
  const positionMasks = new Int32Array(POSITION_COUNT);
  const pairCosts = new Float32Array(POSITION_COUNT * POSITION_COUNT);
  const frequencies: Uint32Array[] = [];
  const scarcity = new Float32Array(GRID_HEIGHT + 1);
  for (const [length, count] of dictionary.available) {
    scarcity[length] = 3 / Math.sqrt(Math.max(1, count));
    for (let offset = 0; offset < length; offset += 1) {
      const position = length * POSITION_STRIDE + offset;
      positionMasks[position] = dictionary.positions[length][offset];
      frequencies[position] = dictionary.counts[length][offset];
    }
  }
  for (let across = 0; across < POSITION_COUNT; across += 1) {
    if (!positionMasks[across]) continue;
    for (let down = 0; down <= across; down += 1) {
      if (!positionMasks[down]) continue;
      let countAcross = 0, countDown = 0, matchingPairs = 0;
      const common = positionMasks[across] & positionMasks[down];
      for (let matched = common; matched; matched &= matched - 1) {
        const letter = 31 - Math.clz32(matched & -matched);
        countAcross += frequencies[across][letter];
        countDown += frequencies[down][letter];
        matchingPairs += frequencies[across][letter] * frequencies[down][letter];
      }
      const acrossWords = dictionary.available.get(Math.floor(across / POSITION_STRIDE))!;
      const downWords = dictionary.available.get(Math.floor(down / POSITION_STRIDE))!;
      const probability = matchingPairs / (acrossWords * downWords);
      const cost = common ? 2 / Math.sqrt(countAcross) + 2 / Math.sqrt(countDown) - 0.6 * Math.log(probability) : 22;
      pairCosts[across * POSITION_COUNT + down] = cost;
      pairCosts[down * POSITION_COUNT + across] = cost;
    }
  }
  return { dictionary, positionMasks, pairCosts, scarcity, requireEveryLetter, guideDomains, rare: requireEveryLetter ? dictionary.rare : 0 };
}

type DictionaryScores = ReturnType<typeof layoutDictionaryScores>;

class MaskSearch {
  private mask = new Uint8Array(CELL_COUNT);
  private blockRows = new Int32Array(GRID_HEIGHT);
  private positions = [new Int16Array(CELL_COUNT), new Int16Array(CELL_COUNT)];
  private lengths = new Int16Array(GRID_HEIGHT + 1);
  private groups = new Int16Array(3);
  private rareCounts = new Int16Array(26);
  private blockCount = 0;
  private wordCount = 0;
  private twoCellRuns = 0;
  private crossings = 0;
  private uncovered = 0;
  private crossingCost = 0;
  private visited = new Uint32Array(CELL_COUNT);
  private visit = 0;
  private queue = new Int16Array(CELL_COUNT);

  constructor(private profile: LayoutProfile, private scores: DictionaryScores, random: SeededRandom) {
    const target = scores.guideDomains
      ? profile.blocks[1] - random.integer(4)
      : profile.blocks[0] + random.integer(profile.blocks[1] - profile.blocks[0] + 1);
    // Drawing blocks from one checkerboard color starts with fewer two-cell runs.
    const parity = random.integer(2);
    const alternating = random.shuffle(CELLS.filter((cell) => (ROWS[cell] + COLUMNS[cell]) % 2 === parity));
    for (const cell of alternating.slice(0, target)) this.mask[cell] = 1;
    this.blockCount = 0;
    for (const cell of CELLS) {
      if (!this.mask[cell]) continue;
      this.blockRows[ROWS[cell]] |= 1 << COLUMNS[cell];
      this.blockCount += 1;
    }
    for (let row = 0; row < GRID_HEIGHT; row += 1) this.scanLine(0, row, 1);
    for (let column = 0; column < GRID_WIDTH; column += 1) this.scanLine(1, column, 1);
    for (const cell of CELLS) this.countCell(cell, 1);
  }

  isBlock(cell: number) {
    return this.mask[cell] === 1;
  }

  private scanLine(direction: number, line: number, sign: number) {
    const across = direction === 0;
    const start = across ? line * GRID_WIDTH : line;
    const step = across ? 1 : GRID_WIDTH;
    const size = across ? GRID_WIDTH : GRID_HEIGHT;
    const positions = this.positions[direction];
    for (let offset = 0, cell = start; offset < size;) {
      if (this.mask[cell]) {
        if (sign > 0) positions[cell] = 0;
        offset += 1;
        cell += step;
        continue;
      }
      let end = offset + 1, next = cell + step;
      while (end < size && !this.mask[next]) {
        end += 1;
        next += step;
      }
      const length = end - offset;
      if (length >= 3) {
        this.wordCount += sign;
        this.lengths[length] += sign;
        this.groups[length <= 5 ? 0 : length <= 9 ? 1 : 2] += sign;
      } else if (length === 2) this.twoCellRuns += sign;
      if (sign > 0) {
        const base = length >= 3 ? length * POSITION_STRIDE : 0;
        for (let position = 0, index = cell; position < length; position += 1, index += step) {
          positions[index] = base ? base + position : 0;
        }
      }
      offset = end;
      cell = next;
    }
  }

  private countCell(cell: number, sign: number) {
    if (this.mask[cell]) return;
    const across = this.positions[0][cell], down = this.positions[1][cell];
    if (!across && !down) this.uncovered += sign;
    const { positionMasks, pairCosts, rare } = this.scores;
    let letters = positionMasks[across || down];
    if (across && down) {
      this.crossings += sign;
      this.crossingCost += sign * pairCosts[across * POSITION_COUNT + down];
      letters &= positionMasks[down];
    }
    for (let bits = letters & rare; bits; bits &= bits - 1) {
      this.rareCounts[31 - Math.clz32(bits & -bits)] += sign;
    }
  }

  flip(first: number, second: number) {
    const firstRow = ROWS[first], firstColumn = COLUMNS[first];
    const secondRow = second < 0 ? firstRow : ROWS[second];
    const secondColumn = second < 0 ? firstColumn : COLUMNS[second];
    const update = (sign: number) => {
      for (let column = 0; column < GRID_WIDTH; column += 1) {
        this.countCell(firstRow * GRID_WIDTH + column, sign);
        if (secondRow !== firstRow) this.countCell(secondRow * GRID_WIDTH + column, sign);
      }
      for (let row = 0; row < GRID_HEIGHT; row += 1) {
        if (row === firstRow || row === secondRow) continue;
        this.countCell(row * GRID_WIDTH + firstColumn, sign);
        if (secondColumn !== firstColumn) this.countCell(row * GRID_WIDTH + secondColumn, sign);
      }
    };
    const scan = (sign: number) => {
      this.scanLine(0, firstRow, sign);
      this.scanLine(1, firstColumn, sign);
      if (firstRow !== secondRow) this.scanLine(0, secondRow, sign);
      if (firstColumn !== secondColumn) this.scanLine(1, secondColumn, sign);
    };
    const toggle = (cell: number) => {
      this.mask[cell] ^= 1;
      this.blockCount += this.mask[cell] ? 1 : -1;
      this.blockRows[ROWS[cell]] ^= 1 << COLUMNS[cell];
    };
    // Only the edited rows, columns, and their crossing cells can change.
    update(-1);
    scan(-1);
    toggle(first);
    if (second >= 0) toggle(second);
    scan(1);
    update(1);
  }

  localScore() {
    let rectangles = 0;
    for (let row = 0; row < GRID_HEIGHT - 1; row += 1) {
      const pair = ALL_COLUMNS ^ (this.blockRows[row] | this.blockRows[row + 1]);
      rectangles += popcount(pair & (pair >>> 1) & (pair >>> 2));
      if (row + 2 < GRID_HEIGHT) {
        const triple = pair & ~this.blockRows[row + 2];
        rectangles += popcount(triple & (triple >>> 1));
      }
    }
    const words = this.wordCount;
    const groupPenalty = outside(this.groups[0], Math.ceil(words * 0.35), Math.floor(words * 0.65))
      + outside(this.groups[1], Math.ceil(words * 0.25), Math.floor(words * 0.55))
      + outside(this.groups[2], Math.ceil(words * 0.03), Math.floor(words * 0.22));
    let unavailable = 0, scarcity = 0, rareCost = 0;
    for (const [length, count] of this.scores.dictionary.available) {
      const used = this.lengths[length];
      unavailable += Math.max(0, used - count);
      scarcity += used * this.scores.scarcity[length];
    }
    for (let bits = this.scores.rare; bits; bits &= bits - 1) {
      const count = this.rareCounts[31 - Math.clz32(bits & -bits)];
      rareCost += count ? 2 / Math.sqrt(count) : 15;
    }
    const hard = 12 * (this.twoCellRuns + rectangles + this.uncovered + unavailable)
      + 8 * outside(this.blockCount, ...this.profile.blocks) + 8 * outside(words, ...this.profile.words)
      + 8 * groupPenalty + 6 * Math.max(0, words + 2 - this.crossings);
    // Sparse crossings leave more options when the short-word dictionary is small.
    const crossingPenalty = this.scores.guideDomains
      ? 4 * Math.max(0, this.crossings - words - 3) + 0.55 * this.crossings
        + 1.5 * Math.max(0, this.lengths[3] - 7) + 0.7 * Math.max(0, this.lengths[4] - 13)
      : 0.32 * this.crossings;
    const blockPenalty = this.scores.guideDomains ? 0.9 * Math.abs(this.profile.blocks[1] - this.blockCount) : 0;
    return { hard, score: hard + scarcity + rareCost + this.crossingCost + crossingPenalty + blockPenalty };
  }

  componentPenalty(issues?: number[]) {
    this.visit += 1;
    let largestOpen = 0, oversizedBlocks = 0;
    for (let cell = 0; cell < CELL_COUNT; cell += 1) {
      if (this.visited[cell] === this.visit) continue;
      const block = this.mask[cell];
      this.queue[0] = cell;
      this.visited[cell] = this.visit;
      let end = 1;
      for (let head = 0; head < end; head += 1) {
        for (const neighbor of NEIGHBORS[this.queue[head]]) {
          if (this.visited[neighbor] === this.visit || this.mask[neighbor] !== block) continue;
          this.visited[neighbor] = this.visit;
          this.queue[end++] = neighbor;
        }
      }
      if (block) {
        oversizedBlocks += Math.max(0, end - 3);
        if (issues && end > 3) for (let index = 0; index < end; index += 1) issues.push(this.queue[index]);
      } else {
        largestOpen = Math.max(largestOpen, end);
        if (issues && end < 20) for (let index = 0; index < end; index += 1) issues.push(this.queue[index]);
      }
    }
    return 16 * oversizedBlocks + 24 * (CELL_COUNT - this.blockCount - largestOpen);
  }

  geometryIssues() {
    const issues: number[] = [];
    this.componentPenalty(issues);
    for (const cell of CELLS) {
      if (this.mask[cell]) continue;
      if (!this.positions[0][cell] && !this.positions[1][cell]) issues.push(cell);
      const row = ROWS[cell], col = COLUMNS[cell];
      if (col > 0 && col + 2 < GRID_WIDTH && this.mask[cell - 1] && !this.mask[cell + 1] && this.mask[cell + 2]) issues.push(cell, cell + 1);
      if (row > 0 && row + 2 < GRID_HEIGHT && this.mask[cell - GRID_WIDTH] && !this.mask[cell + GRID_WIDTH] && this.mask[cell + 2 * GRID_WIDTH]) {
        issues.push(cell, cell + GRID_WIDTH);
      }
      if (row + 1 < GRID_HEIGHT && col + 1 < GRID_WIDTH) {
        const square = !(this.mask[cell + 1] | this.mask[cell + GRID_WIDTH] | this.mask[cell + GRID_WIDTH + 1]);
        const wide = col + 2 < GRID_WIDTH && !(this.mask[cell + 2] | this.mask[cell + GRID_WIDTH + 2]);
        const tall = row + 2 < GRID_HEIGHT && !(this.mask[cell + 2 * GRID_WIDTH] | this.mask[cell + 2 * GRID_WIDTH + 1]);
        if (square && (wide || tall)) issues.push(cell, cell + 1, cell + GRID_WIDTH, cell + GRID_WIDTH + 1);
      }
    }
    return issues;
  }

  toBlockMask() {
    return Array.from({ length: GRID_HEIGHT }, (_, row) =>
      Array.from({ length: GRID_WIDTH }, (_, column) => this.isBlock(row * GRID_WIDTH + column)));
  }
}

export async function searchMasks(
  random: SeededRandom,
  profile: LayoutProfile,
  scores: DictionaryScores,
  history: readonly string[],
  slice: (force?: boolean) => Promise<void> | undefined,
  inspect: (slots: LayoutSlot[]) => Promise<"skip" | "filled" | "accepted">,
) {
  const state = new MaskSearch(profile, scores, random);
  let local = state.localScore(), components = state.componentPenalty();
  let fills = 0;
  let domain: ReturnType<typeof fillPenalty> | undefined;
  let guidanceStarted = 0;
  let penalty = 0;
  let issues = scores.guideDomains ? state.geometryIssues() : [];
  let lastInspection = -100;
  const seen = new Set<string>();
  const tried: string[] = [];
  for (let edit = 0; edit < MASK_EDITS; edit += 1) {
    if ((edit & 31) === 0) {
      const pause = slice();
      if (pause) await pause;
    }
    const target = issues.length && random.next() < 0.45 ? issues : domain?.cells;
    const conflict = target?.length && random.next() < 0.8 ? target[random.integer(target.length)] : -1;
    const first = conflict < 0 ? random.integer(CELL_COUNT)
      : Math.max(0, Math.min(CELL_COUNT - 1, conflict + (random.integer(3) - 1) * GRID_WIDTH + random.integer(3) - 1));
    let second = -1, third = -1, fourth = -1;
    const operation = random.next();
    if (operation < 0.15 && ROWS[first] + 1 < GRID_HEIGHT && COLUMNS[first] + 1 < GRID_WIDTH) {
      second = first + 1;
      third = first + GRID_WIDTH;
      fourth = third + 1;
    } else if (operation < 0.75) {
      const nearby = ROWS[first] + random.integer(7) - 3;
      const column = COLUMNS[first] + random.integer(7) - 3;
      const swap = random.next() < 0.8 && nearby >= 0 && nearby < GRID_HEIGHT && column >= 0 && column < GRID_WIDTH
        ? nearby * GRID_WIDTH + column : random.integer(CELL_COUNT);
      if (first !== swap && (state.isBlock(first) !== state.isBlock(swap) || random.next() < 0.6)) second = swap;
    }
    if (third >= 0) state.flip(third, fourth);
    state.flip(first, second);
    const next = state.localScore();
    const temperature = domain
      ? 1.2 + 9 * (1 - (edit - guidanceStarted) / (MASK_EDITS - guidanceStarted))
      : 0.8 + 5 * (1 - Math.min(edit / 7000, 1));
    const geometryWeight = domain ? 1.5 : 0.5;
    const threshold = local.score + geometryWeight * (local.hard + components) + penalty - temperature * Math.log(1 - random.next());
    // Use the local score as a lower bound before flood filling or propagating domains.
    if (next.score + geometryWeight * next.hard <= threshold) {
      const nextComponents = state.componentPenalty();
      if (next.score + geometryWeight * (next.hard + nextComponents) <= threshold) {
        if (domain && next.hard + nextComponents > 48) {
          state.flip(first, second);
          if (third >= 0) state.flip(third, fourth);
          continue;
        }
        const nextDomain = scores.guideDomains && (domain || (next.hard + nextComponents === 0))
          ? fillPenalty(extractSlots(state.toBlockMask()), scores.dictionary, scores.requireEveryLetter) : undefined;
        const nextPenalty = nextDomain?.cost ?? 0;
        if (domain && next.score + geometryWeight * (next.hard + nextComponents) + nextPenalty > threshold) {
          state.flip(first, second);
          if (third >= 0) state.flip(third, fourth);
          continue;
        }
        local = next;
        components = nextComponents;
        penalty = nextPenalty;
        if (!domain && nextDomain) guidanceStarted = edit;
        domain = nextDomain;
        if (scores.guideDomains) issues = state.geometryIssues();
        if (next.hard === 0 && components === 0 && nextPenalty === 0 && edit - lastInspection >= 4) {
          const mask = state.toBlockMask();
          const pattern = layoutPattern(mask);
          if (!seen.has(pattern) && acceptsLayout(pattern, history) && acceptsLayout(pattern, tried)) {
            seen.add(pattern);
            lastInspection = edit;
            const assessment = assessBlockMask(mask, profile, scores.dictionary.available);
            if (assessment.valid) {
              const result = await inspect(assessment.slots);
              if (result === "accepted") return true;
              if (result === "filled") {
                tried.push(pattern);
                if (++fills >= FILLS_PER_RESTART) break;
              }
            }
          }
        }
        continue;
      }
    }
    state.flip(first, second);
    if (third >= 0) state.flip(third, fourth);
  }
  return false;
}
