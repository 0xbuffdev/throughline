import { format } from "./layout.js";
import type { Frame, Value } from "./model.js";
import { getAt, parseTarget } from "./path.js";
import { visibleScene } from "./scene.js";

/**
 * Semantic summary: one screen-reader-navigable paragraph per frame.
 * The player voices this through a live region and the scene's
 * accessible name, so the trace never depends on vision alone.
 */

const entityValue = (frame: Frame, id: string): Value | undefined =>
	frame.state.entities.find((entity) => entity.id === id)?.value;

/** `input[0]` reads as its addressed value; whole ids read as labels. */
function changedSummary(frame: Frame, target: string): string {
	const parsed = parseTarget(target);
	if (!parsed) return target;
	const value = entityValue(frame, parsed.id);
	if (value === undefined) return target;
	const current: Value | undefined = parsed.path.length
		? getAt(value, parsed.path)
		: value;
	if (current === undefined) return target;
	const name = parsed.path.length
		? target
		: (frame.state.entities.find((entity) => entity.id === parsed.id)?.label ??
			parsed.id);
	return `${name} is ${format(current)}`;
}

const transferSummary = (frame: Frame, relation: string, value?: Value) => {
	const known = frame.state.relations.find(
		(candidate) => candidate.id === relation,
	);
	const what = value === undefined ? "a signal" : format(value);
	if (!known) return `Send ${what} along ${relation}.`;
	const via = known.label ? ` (${known.label})` : "";
	return `Send ${what} along ${relation}${via} from ${known.from} to ${known.to}.`;
};

/**
 * One paragraph naming the step position, label, changed values,
 * focus targets, transfers, and author notes. Deterministic: the
 * same frame always reads the same way.
 */
export function describeFrame(frame: Frame, total?: number): string {
	const count = total ?? frame.index + 1;
	const parts = [`Step ${frame.index + 1} of ${count}: ${frame.label}.`];
	const { state } = frame;
	const scene = visibleScene(state);
	const visible = scene.entities;
	const visibleIds = new Set(visible.map((entity) => entity.id));
	const hiddenIds = new Set(
		state.entities.filter((entity) => entity.hidden).map((entity) => entity.id),
	);
	const shownTarget = (target: string): boolean =>
		!hiddenIds.has(parseTarget(target)?.id ?? "");
	const changed = state.changed.filter(shownTarget);
	const active = state.active.filter(shownTarget);
	if (visible.length === 0 && frame.events.length === 0) {
		parts.push("No entities.");
		return parts.join(" ");
	}
	if (
		frame.index === 0 &&
		state.changed.length === 0 &&
		state.transfers.length === 0 &&
		state.notes.length === 0 &&
		state.active.length === 0
	) {
		parts.push(
			`${visible.map((entity) => `${entity.label} is ${format(entity.value)}`).join("; ")}.`,
		);
		return parts.join(" ");
	}
	for (const event of frame.events) {
		if (event.op !== "show" && event.op !== "hide") continue;
		const item =
			event.kind === "node"
				? state.entities.find((entity) => entity.id === event.id)
				: state.relations.find((relation) => relation.id === event.id);
		if (
			event.op === "show" &&
			!(event.kind === "node"
				? visibleIds.has(event.id)
				: scene.relations.some((relation) => relation.id === event.id))
		)
			continue;
		parts.push(
			`${event.op === "show" ? "Show" : "Hide"} ${item?.label ?? event.id}.`,
		);
		if (
			event.op === "show" &&
			event.kind === "node" &&
			!changed.some((target) => parseTarget(target)?.id === event.id)
		)
			parts.push(`${changedSummary(frame, event.id)}.`);
		if (event.op === "show" && event.kind === "link") {
			const relation = scene.relations.find(
				(candidate) => candidate.id === event.id,
			);
			if (relation) parts.push(`From ${relation.from} to ${relation.to}.`);
		}
	}
	if (changed.length > 0)
		parts.push(
			`${changed.map((target) => changedSummary(frame, target)).join("; ")}.`,
		);
	if (active.length > 0) parts.push(`Focus on ${active.join(", ")}.`);
	for (const transfer of state.transfers)
		parts.push(transferSummary(frame, transfer.relation, transfer.value));
	if (state.notes.length > 0) parts.push(state.notes.join(" "));
	return parts.join(" ");
}
