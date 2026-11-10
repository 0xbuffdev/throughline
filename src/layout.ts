import { nestLayout } from "./layout/hierarchy.js";
import { routeEdges } from "./layout/edges.js";
import { assignRanks } from "./layout/ranks.js";
import type { Box, Layout } from "./layout/types.js";
import { presentValue } from "./layout/value.js";
import type { Entity, GroupLayout, Relation, Trace } from "./model.js";
import { parseTarget } from "./path.js";
import type { ProjectedScene } from "./scene.js";

export { effectiveView, format } from "./layout/measure.js";
export type { Box, Edge, Layout, Pt } from "./layout/types.js";

const PAD = 12;
const GAP = 28;
const laneOf = (entity: Entity): string => entity.lane ?? "State";

type Group = Layout["groups"][number] & { nodes: Record<string, Box> };

function arrangeGroup(
	name: string,
	members: Entity[],
	relations: Relation[],
	sizes: Map<string, Box>,
	arrangement: GroupLayout,
	maxWidth: number,
): Group {
	const ids = new Set(members.map((entity) => entity.id));
	const ranks = assignRanks(
		members,
		relations.filter(
			(relation) => ids.has(relation.from) && ids.has(relation.to),
		),
	);
	const rows: Entity[][] = [];
	for (const member of members) {
		const rank =
			arrangement === "tree"
				? (ranks.get(member.id) ?? 0)
				: arrangement === "column"
					? rows.length
					: 0;
		rows[rank] ??= [];
		rows[rank].push(member);
	}
	const nodes: Record<string, Box> = {};
	let y = 32,
		w = Math.min(maxWidth, Math.max(100, name.length * 7 + 24));
	for (const row of rows) {
		if (!row) continue;
		let x = PAD,
			rowHeight = 0;
		for (const entity of row) {
			const size = sizes.get(entity.id)!;
			if (x > PAD && x + size.w + PAD > maxWidth) {
				y += rowHeight + GAP;
				x = PAD;
				rowHeight = 0;
			}
			nodes[entity.id] = { ...size, x, y };
			rowHeight = Math.max(rowHeight, size.h);
			w = Math.max(w, x + size.w + PAD);
			x += size.w + GAP;
		}
		y += rowHeight + GAP;
	}
	// Center each tree layer after its widest layer has set the panel width.
	if (arrangement === "tree") {
		const levels = new Set(Object.values(nodes).map((box) => box.y));
		for (const level of levels) {
			const boxes = Object.values(nodes).filter((box) => box.y === level);
			const right = Math.max(...boxes.map((box) => box.x + box.w));
			const offset = (w - PAD - right) / 2;
			for (const box of boxes) box.x += offset;
		}
	}
	return { name, x: 0, y: 0, w, h: Math.max(64, y), nodes };
}

/** History-sized boxes and responsive group packing; no per-step layout or shrinking text. */
export function composeTrace(trace: Trace, availableWidth = 720): Layout {
	const width = Math.max(
		160,
		Number.isFinite(availableWidth) ? Math.floor(availableWidth) : 720,
	);
	const entities = trace.frames[0]?.state.entities ?? [];
	const relations = trace.frames[0]?.state.relations ?? [];
	const maxWidth = width - PAD * 2;
	const nodeWidth = Math.min(260, maxWidth - PAD * 2);
	const sizes = new Map<string, Box>();
	for (const frame of trace.frames) {
		const targets = frame.state.active.map(parseTarget);
		for (const entity of frame.state.entities) {
			const focus = targets
				.filter((target) => target?.id === entity.id)
				.map((target) => target!.path);
			const value = presentValue(entity, nodeWidth, focus);
			const old = sizes.get(entity.id);
			sizes.set(entity.id, {
				x: 0,
				y: 0,
				w: Math.max(old?.w ?? 0, value.w),
				h: Math.max(old?.h ?? 0, value.h),
			});
		}
	}
	const names = [...new Set(entities.map(laneOf))];
	const groups = names.map((name) =>
		arrangeGroup(
			name,
			entities.filter((entity) => laneOf(entity) === name),
			relations,
			sizes,
			trace.groups?.find((group) => group.name === name)?.layout ?? "row",
			maxWidth,
		),
	);
	const nodes: Record<string, Box> = {};
	let x = PAD,
		y = PAD,
		rowHeight = 0;
	for (const group of groups) {
		if (x > PAD && x + group.w + PAD > width) {
			x = PAD;
			y += rowHeight + GAP;
			rowHeight = 0;
		}
		group.x = x;
		group.y = y;
		for (const [id, box] of Object.entries(group.nodes))
			nodes[id] = { ...box, x: box.x + x, y: box.y + y };
		x += group.w + GAP;
		rowHeight = Math.max(rowHeight, group.h);
	}
	for (const rowY of new Set(groups.map((group) => group.y))) {
		const row = groups.filter((group) => group.y === rowY);
		const right = Math.max(...row.map((group) => group.x + group.w));
		const offset = Math.max(0, (width - PAD - right) / 2);
		for (const group of row) {
			group.x += offset;
			for (const id of Object.keys(group.nodes)) nodes[id].x += offset;
		}
	}
	const height = Math.max(100, y + rowHeight + PAD);
	return nestLayout({
		width,
		height,
		viewBox: `0 0 ${width} ${height}`,
		groups: groups.map(({ nodes: _, ...group }) => group),
		nodes,
		edges: routeEdges(relations, nodes),
	}, trace);
}

/**
 * Clip stable trace-wide fallback geometry to the projected scene. The
 * underlying positions and viewport are intentionally unchanged by focus,
 * selection, authored visibility, or seeking between frames.
 */
export function projectLayout(layout: Layout, scene: ProjectedScene): Layout {
	const nodes: Layout["nodes"] = Object.fromEntries(
		scene.nodes.flatMap((node) => {
			const box = layout.nodes[node.sourceId];
			return box ? [[node.id, { ...box }]] : [];
		}),
	);
	const edges: Layout["edges"] = Object.fromEntries(
		scene.edges.flatMap((link) => {
			const edge = layout.edges[link.id];
			if (
				!edge ||
				!nodes[link.relation.from] ||
				!nodes[link.relation.to]
			) return [];
			return [[link.id, {
				...edge,
				from: [...edge.from],
				to: [...edge.to],
				label: [...edge.label],
			}]];
		}),
	);
	const names = new Set(scene.groups.map((group) => group.name));
	return {
		...layout,
		groups: layout.groups.filter((group) => names.has(group.name)).map((group) => ({ ...group })),
		nodes,
		edges,
	};
}
