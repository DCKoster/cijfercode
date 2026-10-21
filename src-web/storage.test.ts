import { beforeEach, describe, expect, it } from "vitest";
import { loadStored, migrateLegacyStorage, storeValue } from "./storage";

describe("local storage", () => {
  beforeEach(() => localStorage.clear());
  it("round-trips versioned values and survives malformed JSON", () => {
    storeValue("test", { value: 4 });
    expect(loadStored("test", null)).toEqual({ value: 4 });
    localStorage.setItem("cijfercode:v4:broken", "{");
    expect(loadStored("broken", "fallback")).toBe("fallback");
  });

  it("removes version 2 and 3 puzzles and booklets once", () => {
    localStorage.setItem("cijfercode:v2:player", "old-player");
    localStorage.setItem("cijfercode:v2:booklet", "old-booklet");
    localStorage.setItem("cijfercode:v3:player", "old-player");
    localStorage.setItem("cijfercode:v3:booklet", "old-booklet");
    migrateLegacyStorage();
    expect(localStorage.getItem("cijfercode:v2:player")).toBeNull();
    expect(localStorage.getItem("cijfercode:v2:booklet")).toBeNull();
    expect(localStorage.getItem("cijfercode:v3:player")).toBeNull();
    expect(localStorage.getItem("cijfercode:v3:booklet")).toBeNull();
    expect(localStorage.getItem("cijfercode:v4:migrated")).toBe("true");
  });
});
