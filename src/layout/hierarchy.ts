import { routeEdges } from "./edges.js";
import type { Box, Layout } from "./types.js";
import type { Trace } from "../model.js";

type Placed = {
	w: number;
	h: number;
	nodes: Record<string, Box>;
	groups: Layout["groups"];
};
type GroupInfo = {
	id: string;
	name: string;
	parentId?: string;
};

/**
 * Opt-in hierarchical packer. The existing flat composer remains the exact
 * fallback for legacy traces; only new parent metadata selects this path.
 * Topology and node sizes are read from one trace-wide immutable layout,
 * so step changes cannot move groups or change their bounding boxes.
 */
export function nestLayout(base: Layout, trace: Trace): Layout {
	if (!trace.groups?.some((group) => group.parentId)) return base;
	const infos: GroupInfo[] = trace.groups.map((group) => ({
		id: group.id ?? group.name,
		name: group.name,
		...(group.parentId ? { parentId: group.parentId } : {}),
	}));
	const declared = new Set(infos.map((group) => group.name));
	for (const group of base.groups) {
		if (!declared.has(group.name))
			infos.push({ id: `lane:${group.name}`, name: group.name });
	}
	const byId = new Map(infos.map((group) => [group.id, group]));
	if (byId.size !== infos.length) throw new Error("Invalid group hierarchy: duplicate identity.");
	if (new Set(infos.map((group) => group.name)).size !== infos.length)
		throw new Error("Invalid group hierarchy: duplicate group name.");
	const children = new Map<string, GroupInfo[]>();
	for (const group of infos) {
		if (!group.parentId) continue;
		if (!byId.has(group.parentId)) throw new Error(`Invalid group hierarchy: unknown parent “${group.parentId}”.`);
		const list = children.get(group.parentId) ?? [];
		list.push(group);
		children.set(group.parentId, list);
	}
	const boxByName = new Map(base.groups.map((box) => [box.name, box]));
	const members = new Map<string, string[]>();
	for (const entity of trace.frames[0]?.state.entities ?? []) {
		const name = entity.lane ?? "State";
		const list = members.get(name) ?? [];
		list.push(entity.id);
		members.set(name, list);
	}
	const limit = Math.max(160, base.width - 24);
	const GAP = 28;
	const PAD = 12;
	const move = (placed: Placed, dx: number, dy: number, into: Placed): void => {
		for (const [id, box] of Object.entries(placed.nodes))
			into.nodes[id] = { ...box, x: box.x + dx, y: box.y + dy };
		into.groups.push(...placed.groups.map((box) => ({
			...box, x: box.x + dx, y: box.y + dy,
		})));
	};
	const visit = (group: GroupInfo, depth: number, trail: Set<string>): Placed => {
		if (depth > 32 || trail.has(group.id)) throw new Error("Invalid group hierarchy.");
		const nextTrail = new Set(trail);
		nextTrail.add(group.id);
		const own = boxByName.get(group.name);
		const result: Placed = { w: own?.w ?? 168, h: own?.h ?? 36, nodes: {}, groups: [] };
		for (const id of members.get(group.name) ?? []) {
			const box = base.nodes[id];
			if (box && own)
				result.nodes[id] = { ...box, x: box.x - own.x, y: box.y - own.y };
		}
		const descendants = children.get(group.id) ?? [];
		if (descendants.length) {
			let x = PAD, y = result.h + PAD, rowHeight = 0;
			for (const child of descendants) {
				const placed = visit(child, depth + 1, nextTrail);
				if (x > PAD && x + placed.w + PAD > limit) {
					x = PAD;
					y += rowHeight + GAP;
					rowHeight = 0;
				}
				move(placed, x, y, result);
				result.w = Math.max(result.w, x + placed.w + PAD);
				rowHeight = Math.max(rowHeight, placed.h);
				x += placed.w + GAP;
			}
			result.h = y + rowHeight + PAD;
		}
		result.groups.unshift({
			id: group.id,
			...(group.parentId ? { parentId: group.parentId } : {}),
			name: group.name,
			x: 0, y: 0, w: result.w, h: result.h,
		});
		return result;
	};
	const result: Placed = { w: base.width, h: 100, nodes: {}, groups: [] };
	let x = PAD, y = PAD, rowHeight = 0;
	for (const group of infos.filter((item) => !item.parentId)) {
			const placed = visit(group, 0, new Set());
			if (x > PAD && x + placed.w + PAD > base.width) {
				x = PAD;
				y += rowHeight + GAP;
				rowHeight = 0;
			}
			move(placed, x, y, result);
			result.w = Math.max(result.w, x + placed.w + PAD);
			x += placed.w + GAP;
			rowHeight = Math.max(rowHeight, placed.h);
		}
	if (result.groups.length !== infos.length)
		throw new Error("Invalid group hierarchy: disconnected cycle or invalid nesting.");
	result.h = Math.max(100, y + rowHeight + PAD);
	// Some vertically nested groups legitimately exceed the host width.
	// Expand the SVG world, never clip descendant summaries or link endpoints.
	result.w = Math.max(
		result.w,
		...Object.values(result.nodes).map((box) => box.x + box.w + PAD),
		...result.groups.map((box) => box.x + box.w + PAD),
	);
	return {
		width: result.w,
		height: result.h,
		viewBox: `0 0 ${result.w} ${result.h}`,
		groups: result.groups,
		nodes: result.nodes,
		edges: routeEdges(trace.frames[0]?.state.relations ?? [], result.nodes),
	};
}
