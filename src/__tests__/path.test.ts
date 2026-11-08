import { describe, expect, it } from "vitest";
import { getAt, parseTarget, setAt } from "../path.js";

describe("parseTarget", () => {
	it("parses ids, indices, and keys", () => {
		expect(parseTarget("grid[1][2]")).toEqual({ id: "grid", path: [1, 2] });
		expect(parseTarget("cfg.mode")).toEqual({ id: "cfg", path: ["mode"] });
		expect(parseTarget("arr")).toEqual({ id: "arr", path: [] });
	});

	it("rejects unsafe or malformed paths", () => {
		expect(parseTarget("cfg.__proto__")).toBeNull();
		expect(parseTarget("a[-1]")).toBeNull();
		expect(parseTarget("1a")).toBeNull();
	});
});

describe("setAt", () => {
	it("writes immutably", () => {
		const original = { list: [1, 2], mode: "a" };
		const next = setAt(original, ["list", 2], 3) as typeof original;
		expect(next.list).toEqual([1, 2, 3]);
		expect(original.list).toEqual([1, 2]);
	});

	it("rejects holes and non-arrays", () => {
		expect(() => setAt([1], [5], 0)).toThrow(/out of range/);
		expect(() => setAt(4, [0], 1)).toThrow(/non-array/);
	});
});

describe("getAt", () => {
	it("reads nested values and returns undefined for misses", () => {
		const value = { list: [1, 2], mode: "a" };
		expect(getAt(value, ["list", 1])).toBe(2);
		expect(getAt(value, ["missing"])).toBeUndefined();
	});
});
