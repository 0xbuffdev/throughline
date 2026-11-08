import type { Value, View } from "../model.js";

type Shown = Exclude<View, "auto">;

export const format = (value: Value): string =>
	typeof value === "string" ? value : JSON.stringify(value);

/** A node's requested view if the value supports it, otherwise the best fit. Evaluated per frame. */
export function effectiveView(view: View | undefined, value: Value): Shown {
	const guess = (): Shown =>
		Array.isArray(value)
			? value.length > 0 && value.every((row) => Array.isArray(row))
				? "matrix"
				: "array"
			: typeof value === "number"
				? "number"
				: value !== null && typeof value === "object"
					? "record"
					: "text";
	switch (view) {
		case "array":
		case "stack":
			return Array.isArray(value) ? view : guess();
		case "matrix":
			return Array.isArray(value) && value.every((row) => Array.isArray(row))
				? "matrix"
				: guess();
		case "bits":
			return typeof value === "number" &&
				Number.isSafeInteger(value) &&
				value >= 0
				? "bits"
				: guess();
		case "record":
			return value !== null &&
				typeof value === "object" &&
				!Array.isArray(value)
				? "record"
				: guess();
		case "number":
			return typeof value === "number" ? "number" : guess();
		case "text":
			return "text";
		default:
			return guess();
	}
}
