import { routeEdges } from "../layout/edges.js";
import type { Box, Layout } from "../layout/types.js";
import type { CompiledTrace, Id, ViewDescriptor } from "./model.js";
import { summarizeCell } from "./value-summary.js";

/**
 * Reuse the tested, pure v1 edge routing geometry algorithm, *not* a v1
 * compiler/trace adapter. Layout is calculated against all DECLARED entities
 * once so seeking never jumps nodes when topology presence changes.
 *
 * Groups occupy nested panels in declared tree order. Collapse is projected
 * later; it cannot mutate or relayout authored model state.
 */
const PAD = 12;
const GAP = 24;
const NODE_HEIGHT = 52;
const GROUP_HEADER = 26;
const SUMMARY_HEIGHT = 52;

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });
const limitWidth = (width: number): number =>
	Math.max(160, Number.isFinite(width) ? Math.floor(width) : 720);

export function layoutGraph(trace: CompiledTrace, availableWidth = 720): Layout {
	const width = limitWidth(availableWidth);
	const groups = trace.artifact.groups ?? [];
	const byParent = new Map<Id | undefined, Id[]>();
	for (const group of groups) {
		const siblings = byParent.get(group.parentId) ?? [];
		siblings.push(group.id);
		byParent.set(group.parentId, siblings);
	}
	const byGroup = new Map<Id | undefined, Id[]>();
	for (const entity of trace.artifact.entities) {
		const siblings = byGroup.get(entity.groupId) ?? [];
		siblings.push(entity.id);
		byGroup.set(entity.groupId, siblings);
	}
	const entityIndex = new Map(trace.artifact.entities.map((e, i) =>
		[e.id, "node_" + i] as const));
	const groupIndex = new Map(groups.map((g, i) => [g.id, "group_" + i] as const));
	const groupById = new Map(groups.map(group => [group.id, group] as const));
	// Compute once for the whole trace. A long value never expands a card,
	// and seeking/presence changes cannot change its reserved geometry.
	const widths = new Map<Id, number>();
	const summaryWidths = new WeakMap<object, number>();
	const textWidth = (text: string): number => Math.min(32, [...text].length) * 6.6;
	for (const entity of trace.artifact.entities) {
		let measured = textWidth(entity.label);
		for (const frame of trace.frames) {
			const cell = frame.snapshot.values[entity.id];
			let valueWidth = summaryWidths.get(cell);
			if (valueWidth === undefined) {
				valueWidth = textWidth(summarizeCell(cell));
				summaryWidths.set(cell, valueWidth);
			}
			measured = Math.max(measured, valueWidth);
		}
		widths.set(entity.id, Math.max(64, Math.min(188, Math.ceil(measured + 20))));
	}
	const nodes: Layout["nodes"] = Object.create(null);
	const panels: Layout["groups"] = [];
	let y = PAD;

	/** Structural levels are presentation, not inferred event chronology. */
	function levels(ids: readonly Id[]): readonly (readonly Id[])[] {
		const members = new Set(ids);
		const degree = new Map(ids.map(id => [id, 0]));
		const outgoing = new Map(ids.map(id => [id, [] as Id[]]));
		for (const relation of trace.artifact.relations) {
			if (!members.has(relation.from) || !members.has(relation.to)) continue;
			outgoing.get(relation.from)!.push(relation.to);
			degree.set(relation.to, degree.get(relation.to)! + 1);
		}
		const result: Id[][] = [];
		let current = ids.filter(id => degree.get(id) === 0);
		let visited = 0;
		while (current.length) {
			result.push(current);
			visited += current.length;
			const next = new Set<Id>();
			for (const id of current) for (const to of outgoing.get(id)!) {
				degree.set(to, degree.get(to)! - 1);
				if (degree.get(to) === 0) next.add(to);
			}
			current = ids.filter(id => next.has(id));
		}
		return visited === ids.length ? result : [ids]; // cycles retain a stable grid
	}

	function arrangeMembers(ids: readonly Id[], depth: number): void {
		if (!ids.length) return;
		const x = PAD + Math.min(depth * 8, 24);
		const available = Math.max(80, width - 2 * x);
		for (const level of levels(ids)) {
			let row: Id[] = [];
			let occupied = 0;
			const flush = () => {
				let left = (width - occupied) / 2;
				for (const id of row) {
					const w = Math.min(widths.get(id)!, available);
					nodes[entityIndex.get(id)!] = box(left, y, w, NODE_HEIGHT);
					left += w + GAP;
				}
				y += NODE_HEIGHT + GAP;
				row = []; occupied = 0;
			};
			for (const id of level) {
				const w = Math.min(widths.get(id)!, available);
				if (row.length && occupied + GAP + w > available) flush();
				occupied += (row.length ? GAP : 0) + w;
				row.push(id);
			}
			if (row.length) flush();
		}
	}

	function arrangeGroup(id: Id, depth: number): void {
		const group = groupById.get(id)!;
		const start = y;
		const x = PAD + Math.min(depth * 8, 24);
		const w = width - 2 * x;
		const itemId = groupIndex.get(id)!;
		// Record the parent panel BEFORE visiting descendants. A valid
		// artifact can declare children before parents, but the SVG painter
		// must always draw ancestor backgrounds first. Preserve the authored
		// sibling order by traversing each parent's declared child list.
		const panel: Layout["groups"][number] = {
			name: group.label,
			id: itemId,
			parentId: group.parentId ? groupIndex.get(group.parentId) : undefined,
			x, y: start, w, h: 0,
		};
		panels.push(panel);
		y += GROUP_HEADER;
		arrangeMembers(byGroup.get(id) ?? [], depth + 1);
		for (const child of byParent.get(id) ?? []) arrangeGroup(child, depth + 1);
		y = Math.max(y, start + GROUP_HEADER + SUMMARY_HEIGHT + 12);
		panel.h = y - start;
		const summaryWidth = Math.min(172, Math.max(100, w - 16));
		nodes[itemId] = box((width - summaryWidth) / 2, start + GROUP_HEADER, summaryWidth, SUMMARY_HEIGHT);
		y += GAP;
	}
	arrangeMembers(byGroup.get(undefined) ?? [], 0);
	for (const group of byParent.get(undefined) ?? []) arrangeGroup(group, 0);
	const naturalHeight = Math.max(0, y - GAP + PAD);
	const height = Math.max(100, naturalHeight);
	const offsetY = (height - naturalHeight) / 2;
	for (const node of Object.values(nodes)) node.y += offsetY;
	for (const group of panels) group.y += offsetY;
	return {
		width, height, viewBox: "0 0 " + width + " " + height,
		groups: panels,
		nodes,
		edges: Object.create(null), // v2 relation endpoints are resolved per projection
	};
}

/**
 * Clip stable trace-wide geometry to one renderer-independent descriptor and
 * reuse proven routeEdges for exact/aggregated visible links. Geometry cannot
 * alter source identities, current evidence or modeled existence.
 */
export function layoutGraphView(layout: Layout, view: ViewDescriptor): Layout {
	const items = view.items.filter(item =>
		item.role === "entity" || item.role === "group");
	const nodes: Layout["nodes"] = Object.create(null);
	for (const item of items) {
		if (item.role === "group" && item.data &&
			typeof item.data === "object" && !Array.isArray(item.data) &&
			(item.data as Readonly<Record<string, unknown>>).collapsed !== true) continue;
		if (layout.nodes[item.id]) nodes[item.id] = { ...layout.nodes[item.id] };
	}
	const shown = new Set(view.items.filter(i => i.role === "group").map(i => i.id));
	const groups = layout.groups.filter(g => g.id && shown.has(g.id)).map(g => ({...g}));
	const declaredLinks = view.items.filter(item =>
		item.role === "relation" && item.fromItemId && item.toItemId &&
		nodes[item.fromItemId] && nodes[item.toItemId]).map(item => ({
			id: item.id, from: item.fromItemId!, to: item.toItemId!, label: item.label,
		}));
	return {
		...layout,
		nodes,
		groups,
		edges: routeEdges(declaredLinks, nodes, groups, { separateParallel: true }),
	};
}
