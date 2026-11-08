import type { Value } from "./model.js";

export type Path = (string | number)[];
export type Target = { id: string; path: Path };

const TARGET = /^([A-Za-z][\w-]*)((?:\[\d+\]|\.[A-Za-z_][\w-]*)*)$/;
const BLOCKED = new Set(["__proto__", "constructor", "prototype"]);

export function parseTarget(text: string): Target | null {
	const match = TARGET.exec(text);
	if (!match) return null;
	const path: Path = [];
	for (const part of match[2].matchAll(/\[(\d+)\]|\.([A-Za-z_][\w-]*)/g))
		path.push(part[1] !== undefined ? Number(part[1]) : part[2]);
	if (path.some((key) => typeof key === "string" && BLOCKED.has(key)))
		return null;
	return { id: match[1], path };
}

export const overlaps = (a: Path, b: Path) =>
	a
		.slice(0, Math.min(a.length, b.length))
		.every((key, index) => key === b[index]);

export function getAt(value: Value | undefined, path: Path): Value | undefined {
	let current = value;
	for (const key of path) {
		if (typeof key === "number")
			current = Array.isArray(current) ? current[key] : undefined;
		else
			current =
				current !== null &&
				typeof current === "object" &&
				!Array.isArray(current) &&
				Object.hasOwn(current, key)
					? current[key]
					: undefined;
		if (current === undefined) return undefined;
	}
	return current;
}

/** Immutable write. Arrays may grow by exactly one (index === length); records may gain keys. */
export function setAt(value: Value, path: Path, next: Value): Value {
	if (!path.length) return next;
	const [head, ...rest] = path;
	if (typeof head === "number") {
		if (!Array.isArray(value))
			throw new Error(`Cannot index [${head}] into a non-array value.`);
		if (head > value.length)
			throw new Error(
				`Index [${head}] is out of range (length ${value.length}).`,
			);
		const copy = value.slice();
		copy[head] = setAt(head === value.length ? null : value[head], rest, next);
		return copy;
	}
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error(`Cannot read .${head} from a non-record value.`);
	return {
		...value,
		[head]: setAt(Object.hasOwn(value, head) ? value[head] : null, rest, next),
	};
}
