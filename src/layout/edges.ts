import type { Relation } from "../model.js";
import type { Box, Edge, Pt } from "./types.js";

function bypass(a: Box, b: Box, blockers: Box[], horizontal: boolean): Edge {
	if (horizontal) {
		const y =
			Math.max(a.y + a.h, b.y + b.h, ...blockers.map((box) => box.y + box.h)) +
			16;
		const from: Pt = [a.x + a.w / 2, a.y + a.h];
		const to: Pt = [b.x + b.w / 2, b.y + b.h];
		return {
			from,
			to,
			d: `M${from[0]} ${from[1]}V${y}H${to[0]}V${to[1]}`,
			label: [(from[0] + to[0]) / 2, y],
			angle: -Math.PI / 2,
		};
	}
	const x = Math.min(a.x, b.x, ...blockers.map((box) => box.x)) - 10;
	const from: Pt = [a.x, a.y + a.h / 2];
	const to: Pt = [b.x, b.y + b.h / 2];
	return {
		from,
		to,
		d: `M${from[0]} ${from[1]}H${x}V${to[1]}H${to[0]}`,
		label: [x, (from[1] + to[1]) / 2],
		angle: 0,
	};
}

/** Attach to the facing sides, preserving direction in horizontal and stacked scenes. */
export function routeEdges(
	relations: Relation[],
	nodes: Record<string, Box>,
): Record<string, Edge> {
	const edges: Record<string, Edge> = {};
	// Use one geometry snapshot for all links rather than allocating per link.
	const boxes = Object.values(nodes);
	for (const relation of relations) {
		const a = nodes[relation.from];
		const b = nodes[relation.to];
		if (!a || !b) continue;
		const dx = b.x + b.w / 2 - a.x - a.w / 2;
		const dy = b.y + b.h / 2 - a.y - a.h / 2;
		const horizontal = Math.abs(dx) > Math.abs(dy);
		const blockers = boxes.filter(
			(box) =>
				box !== a &&
				box !== b &&
				(horizontal
					? box.x > Math.min(a.x, b.x) &&
						box.x < Math.max(a.x, b.x) &&
						box.y < Math.max(a.y + a.h, b.y + b.h) &&
						box.y + box.h > Math.min(a.y, b.y)
					: box.y > Math.min(a.y, b.y) &&
						box.y < Math.max(a.y, b.y) &&
						box.x < Math.max(a.x + a.w, b.x + b.w) &&
						box.x + box.w > Math.min(a.x, b.x)),
		);
		if (blockers.length) {
			edges[relation.id] = bypass(a, b, blockers, horizontal);
			continue;
		}
		let from: Pt, to: Pt, c1: Pt, c2: Pt;
		if (relation.from === relation.to) {
			from = [a.x + a.w * 0.65, a.y + a.h];
			to = [a.x + a.w * 0.35, a.y + a.h];
			c1 = [from[0] + 12, from[1] + 24];
			c2 = [to[0] - 12, to[1] + 24];
		} else if (Math.abs(dx) > Math.abs(dy)) {
			const direction = Math.sign(dx);
			from = [direction > 0 ? a.x + a.w : a.x, a.y + a.h / 2];
			to = [direction > 0 ? b.x : b.x + b.w, b.y + b.h / 2];
			const bend = Math.max(14, Math.abs(to[0] - from[0]) / 2);
			c1 = [from[0] + direction * bend, from[1]];
			c2 = [to[0] - direction * bend, to[1]];
		} else {
			const direction = Math.sign(dy) || 1;
			from = [a.x + a.w / 2, direction > 0 ? a.y + a.h : a.y];
			to = [b.x + b.w / 2, direction > 0 ? b.y : b.y + b.h];
			const bend = Math.max(14, Math.abs(to[1] - from[1]) / 2);
			c1 = [from[0], from[1] + direction * bend];
			c2 = [to[0], to[1] - direction * bend];
		}
		edges[relation.id] = {
			d: `M${from[0]} ${from[1]}C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${to[0]} ${to[1]}`,
			from,
			to,
			label: [
				(from[0] + 3 * c1[0] + 3 * c2[0] + to[0]) / 8,
				(from[1] + 3 * c1[1] + 3 * c2[1] + to[1]) / 8,
			],
			angle: Math.atan2(to[1] - c2[1], to[0] - c2[0]),
		};
	}
	return edges;
}
