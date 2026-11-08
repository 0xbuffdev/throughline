import { ProgramError } from "./model.js";

/** Fixed v1 safety ceilings, independent of machine speed or wall-clock timing. */
export const COMPILATION_LIMITS = Object.freeze({
	sourceCharacters: 262_144,
	programUnits: 1_000_000,
	traceUnits: 8_000_000,
	entities: 200,
	relations: 1000,
	steps: 2000,
	events: 10_000,
});

/**
 * Account for expanded JSON, including repeated references. One unit per
 * UTF-16 code unit in strings/keys, eight per scalar/container. This is a
 * deterministic work/payload budget, not a claim about exact heap bytes.
 * Memoization makes shared immutable snapshots cheap to measure without
 * discounting their cost when serialized. Use a fresh budget for mutable data.
 */
export function createBudget(
	name: string,
	limit: number,
): (value: unknown) => void {
	const sizes = new WeakMap<object, number>();
	const visiting = new WeakSet<object>();
	let total = 0;
	const fail = (message: string): never => {
		throw new ProgramError([{ message: `${name}: ${message}` }]);
	};
	const check = (size: number): number => {
		if (size > limit) fail(`exceeds compilation limit (${limit} units).`);
		return size;
	};
	const measure = (value: unknown, depth: number): number => {
		if (depth > 64) fail("JSON nesting exceeds the compilation limit.");
		if (value === null || typeof value === "boolean") return 8;
		if (typeof value === "string") return check(8 + value.length);
		if (typeof value === "number" && Number.isFinite(value)) return 8;
		if (typeof value !== "object" || value === null)
			return fail("expected finite JSON data.");
		if (visiting.has(value)) fail("cyclic values are not JSON data.");
		const cached = sizes.get(value);
		if (cached !== undefined) return cached;
		if (
			!Array.isArray(value) &&
			Object.getPrototypeOf(value) !== Object.prototype
		)
			fail("expected plain JSON objects.");
		visiting.add(value);
		let size = 8;
		if (Array.isArray(value)) {
			for (const item of value) size = check(size + measure(item, depth + 1));
		} else {
			for (const [key, item] of Object.entries(value)) {
				// Optional object fields are omitted by JSON.stringify too.
				if (item !== undefined)
					size = check(size + key.length + measure(item, depth + 1));
			}
		}
		visiting.delete(value);
		sizes.set(value, size);
		return size;
	};
	return (value) => {
		total = check(total + measure(value, 0));
	};
}

export function checkSourceSize(characters: number): void {
	if (characters > COMPILATION_LIMITS.sourceCharacters)
		throw new ProgramError([
			{
				message: `Source exceeds compilation limit (${COMPILATION_LIMITS.sourceCharacters} characters).`,
			},
		]);
}
