// @vitest-environment node
import { describe, expect, it } from "vitest";
import { blockClusterSizes, connectedOpenCells, countOpenAreasLargerThanTwoByTwo, countOpenThreeByThreeAreas, countTwoCellRuns, extractSlots, lengthDistribution, assessBlockMask, GRID_HEIGHT, GRID_WIDTH, LAYOUT_PROFILES } from "./layout";

describe("dense block layouts", () => {
  it("extracts horizontal and vertical slots and measures their lengths", () => {
    const mask = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(true) as boolean[]);
    for (let column = 1; column <= 5; column += 1) mask[2][column] = false;
    for (let row = 2; row <= 9; row += 1) mask[row][3] = false;
    const slots = extractSlots(mask);
    expect(slots.map((slot) => [slot.direction, slot.length])).toEqual([["across", 5], ["down", 8]]);
    expect(lengthDistribution(slots)).toEqual({ short: 1, medium: 1, long: 0 });
    expect(connectedOpenCells(mask)).toBe(12);
  });

  it("rejects disconnected and unsupported masks", () => {
    const mask = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(true) as boolean[]);
    for (let column = 0; column < 3; column += 1) { mask[0][column] = false; mask[19][column] = false; }
    const assessment = assessBlockMask(mask, LAYOUT_PROFILES.interactive, new Map([[3, 1]]));
    expect(assessment.valid).toBe(false);
  });

  it("detects words touching side-by-side as two-cell runs", () => {
    const mask = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(true) as boolean[]);
    for (let column = 1; column <= 5; column += 1) {
      mask[2][column] = false;
      mask[3][column] = false;
    }
    expect(countTwoCellRuns(mask)).toBe(5);
  });

  it("measures orthogonally connected block clusters", () => {
    const mask = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(false) as boolean[]);
    mask[0][0] = mask[0][1] = mask[1][1] = true;
    for (let column = 5; column < 10; column += 1) mask[4][column] = true;
    expect(blockClusterSizes(mask).sort((a, b) => a - b)).toEqual([3, 5]);
    expect(assessBlockMask(mask, LAYOUT_PROFILES.interactive, new Map()).valid).toBe(false);
  });

  it("detects solid letter areas larger than two by two", () => {
    const mask = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(true) as boolean[]);
    for (let row = 4; row < 7; row += 1) for (let column = 5; column < 9; column += 1) mask[row][column] = false;
    expect(countOpenThreeByThreeAreas(mask)).toBe(2);
  });

  it("rejects both two-by-three orientations", () => {
    const horizontal = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(true) as boolean[]);
    for (let row = 4; row < 6; row += 1) for (let column = 5; column < 8; column += 1) horizontal[row][column] = false;
    expect(countOpenAreasLargerThanTwoByTwo(horizontal)).toBe(1);

    const vertical = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(true) as boolean[]);
    for (let row = 4; row < 7; row += 1) for (let column = 5; column < 7; column += 1) vertical[row][column] = false;
    expect(countOpenAreasLargerThanTwoByTwo(vertical)).toBe(1);
  });
});
