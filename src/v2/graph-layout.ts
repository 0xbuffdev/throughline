import { routeEdges } from "../layout/edges.js";
import type { Box, Layout } from "../layout/types.js";
import type { CompiledTrace, Id, ViewDescriptor } from "./model.js";

/**
 * Reuse the tested, pure v1 edge routing geometry algorithm, *not* a v1
 * compiler/trace adapter. Layout is calculated against all DECLARED entities
 * once so seeking never jumps nodes when topology presence changes.
 *
 * Groups occupy nested panels in declared tree order. Collapse is projected
 * later; it cannot mutate or relayout authored model state.
 */
const PAD = 12;
const GAP = 12;
const NODE_HEIGHT = 52;
const GROUP_HEADER = 26;
const SUMMARY_HEIGHT = 52;

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });
const limitWidth = (width: number): number =>
	Math.max(160, Number.isFinite(width) ? Math.floor(width) : 720);

/**
 * The Figma player uses a stable horizontal group world (828×300 baseline),
 * independent of the embed's viewport width. Keep that composition for the
 * public player while allowing the existing narrow-width pure layout for
 * consumers explicitly requesting a smaller geometry.
 *
 * This is layout only: identities, order, presence, message and value evidence
 * always come from the compiled source. The world can extend vertically for
 * larger or nested authored groups, rather than clipping a real entity.
 */
function prototypeWorld(trace: CompiledTrace, width: number): Layout {
 const { artifact } = trace;
 const groups = artifact.groups ?? [];
 const byParent = new Map<Id | undefined, Id[]>();
 const byGroup = new Map<Id | undefined, Id[]>();
 for (const group of groups) {
  const list = byParent.get(group.parentId) ?? [];
  list.push(group.id); byParent.set(group.parentId, list);
 }
 for (const entity of artifact.entities) {
  const list = byGroup.get(entity.groupId) ?? [];
  list.push(entity.id); byGroup.set(entity.groupId, list);
 }
 const entityIndex = new Map(artifact.entities.map((e,i) => [e.id, "node_"+i] as const));
 const groupIndex = new Map(groups.map((g,i) => [g.id, "group_"+i] as const));
 const groupById = new Map(groups.map(g=>[g.id,g] as const));
 const nodes: Layout["nodes"] = Object.create(null);
 const panels: Layout["groups"] = [];
 const INNER = 16, GROUP_GAP = 30, ROW = 144;
 const ownWidth = (id: Id): number =>
  Math.min(372, (byGroup.get(id)?.length ?? 0) > 2 ? 372 : 176);
 const demand = (id: Id): number => {
  const children = byParent.get(id) ?? [];
  return Math.max(ownWidth(id), children.length
   ? children.reduce((sum, child) => sum + demand(child), 0) +
     (children.length-1)*GROUP_GAP+INNER*2 : 0);
 };
 // Share excess world width across actual groups. This reproduces the
 // original narrow processing/external lanes and wider request/order lane.
 const widths = (ids: readonly Id[], budget: number): number[] => {
  if (!ids.length) return [];
  const natural = ids.map(demand);
  const gap = GROUP_GAP*(ids.length-1);
  const usable = Math.max(0,budget-gap);
  const sum = natural.reduce((a,b)=>a+b,0);
  if (sum<=usable) return natural.map(w=>w+(usable-sum)/ids.length);
  const scale=usable/Math.max(sum,1);
  return natural.map(w=>Math.max(116,Math.floor(w*scale)));
 };
 const arrangeGroup = (id: Id, x: number, y: number, w: number): number => {
  const g=groupById.get(id)!;
  const panel: Layout["groups"][number] = {
   id:groupIndex.get(id)!, name:g.label,
   ...(g.parentId?{parentId:groupIndex.get(g.parentId)}:{}),
   x, y, w, h:254,
  };
  panels.push(panel); // parents paint before children even with unordered IDs
  const members=byGroup.get(id) ?? [];
  const cols=members.length>2 && w>=320 ? 2 : 1;
  const rows=Math.ceil(members.length/cols);
  const top=y+36;
  for (const [index,entityId] of members.entries()) {
   const col=index%cols, row=Math.floor(index/cols);
   const px=cols===1 ? x+(w-116)/2 :
    col===0 ? x+INNER : x+w-INNER-116;
   nodes[entityIndex.get(entityId)!]=box(px,top+row*ROW,116,52);
  }
  const children=byParent.get(id) ?? [];
  const childTop=top+(rows ? (rows-1)*ROW+52+30 : 0);
  let childBottom=y;
  if (children.length) {
   const childWidths=widths(children,w-INNER*2);
   let cx=x+INNER;
   for (const [index,childId] of children.entries()) {
    const cw=childWidths[index];
    childBottom=Math.max(childBottom,arrangeGroup(childId,cx,childTop,cw));
    cx+=cw+GROUP_GAP;
   }
  }
  panel.h=Math.max(254, Math.max(
   rows ? top+(rows-1)*ROW+52+22 : y+36, childBottom+18
  )-y);
  const summaryWidth=Math.min(150,Math.max(116,w-16));
  nodes[groupIndex.get(id)!]=box(x+(w-summaryWidth)/2,y+36,summaryWidth,52);
  return y+panel.h;
 };
 const ROOT_X=18, ROOT_Y=30;
 const roots=byParent.get(undefined) ?? [];
 let bottom=ROOT_Y;
 if (roots.length) {
  const rootWidths=widths(roots,width-ROOT_X*2);
  let x=ROOT_X;
  for (const [index,id] of roots.entries()) {
   bottom=Math.max(bottom,arrangeGroup(id,x,ROOT_Y,rootWidths[index]));
   x+=rootWidths[index]+GROUP_GAP;
  }
 }
 const ungrouped=byGroup.get(undefined) ?? [];
 const start=roots.length ? bottom+30 : ROOT_Y+36;
 const columns=Math.max(1,Math.floor((width-36+12)/128));
 for (const [index,id] of ungrouped.entries()) {
  nodes[entityIndex.get(id)!]=box(
   18+(index%columns)*128,start+Math.floor(index/columns)*144,116,52);
 }
 if (ungrouped.length)
  bottom=start+Math.ceil(ungrouped.length/columns)*144;
 return {
  width, height:Math.max(300,bottom+16), viewBox:"0 0 "+width+" "+Math.max(300,bottom+16),
  groups:panels,nodes,edges:Object.create(null),
 };
}

export function layoutGraph(trace: CompiledTrace, availableWidth = 720): Layout {
	if (availableWidth >= 828 && (trace.artifact.groups?.length ?? 0) > 0 &&
		trace.artifact.groups!.length <= 8 && trace.artifact.entities.length <= 24)
		return prototypeWorld(trace, Math.floor(availableWidth));
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
	const nodes: Layout["nodes"] = Object.create(null);
	const panels: Layout["groups"] = [];
	let y = PAD;

	/** The item order depends only on the authored group/identity tree. */
	function arrangeMembers(ids: readonly Id[], depth: number): void {
		if (!ids.length) return;
		const x = PAD + Math.min(depth * 8, 24);
		const available = Math.max(120, width - x - PAD);
		const nodeWidth = Math.min(116, available);
		const columns = Math.max(1, Math.floor((available + GAP) / (nodeWidth + GAP)));
		for (const [index, id] of ids.entries()) {
			const col = index % columns;
			const row = Math.floor(index / columns);
			nodes[entityIndex.get(id)!] = box(x + col * (nodeWidth + GAP),
				y + row * (NODE_HEIGHT + GAP), nodeWidth, NODE_HEIGHT);
		}
		y += Math.ceil(ids.length / columns) * (NODE_HEIGHT + GAP);
	}

	function arrangeGroup(id: Id, depth: number): void {
		const group = groupById.get(id)!;
		const start = y;
		const x = PAD + Math.min(depth * 8, 24);
		const w = width - x - PAD;
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
		nodes[itemId] = box(x + 8, start + GROUP_HEADER, summaryWidth, SUMMARY_HEIGHT);
		y += GAP;
	}
	arrangeMembers(byGroup.get(undefined) ?? [], 0);
	for (const group of byParent.get(undefined) ?? []) arrangeGroup(group, 0);
	const height = Math.max(100, y + PAD);
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
			item.data.collapsed !== true) continue;
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
		edges: routeEdges(declaredLinks, nodes, groups),
	};
}
