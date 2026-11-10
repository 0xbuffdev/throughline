import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { Layout } from "../layout/types.js";
import { format } from "../layout/measure.js";
import {
	cameraViewBox,
	constrainCamera,
	fitCamera,
	focusCamera,
	MAX_ZOOM,
	MIN_ZOOM,
	panCamera,
	zoomCamera,
	type Camera,
	type Point,
} from "../layout/viewport.js";
import type { Frame, Trace } from "../model.js";
import { projectLayout } from "../layout.js";
import { projectScene } from "../scene.js";
import { parseTarget } from "../path.js";
import { TraceScene } from "./scene.js";

type Gesture = {
	camera: Camera;
	inverse: DOMMatrix;
	start: Map<number, Point>;
};

type ViewportProps = {
	trace: Trace;
	frame?: Frame;
	previous?: Frame;
	layout: Layout;
	summary: string;
	captionId: string;
};

const point = (event: React.PointerEvent): Point => ({ x: event.clientX, y: event.clientY });
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

function scenePoint(svg: SVGSVGElement, x: number, y: number): Point | null {
	const inverse = svg.getScreenCTM()?.inverse();
	if (!inverse) return null;
	const transformed = new DOMPoint(x, y).matrixTransform(inverse);
	return { x: transformed.x, y: transformed.y };
}

/**
 * View-only state lives here instead of in seek/trace. The frame-driven camera
 * is derived during render; it cannot race a user's manual drag in an effect.
 */
export function ViewportScene({
	trace,
	frame,
	previous,
	layout,
	summary,
	captionId,
}: ViewportProps): React.JSX.Element {
	const svgRef = useRef<SVGSVGElement>(null);
	const pointers = useRef(new Map<number, Point>());
	const pointerNodes = useRef(new Map<number, string | null>());
	const pointerGroups = useRef(new Map<number, string | null>());
	const gesture = useRef<Gesture | null>(null);
	const dragged = useRef(false);
	const [identity, setIdentity] = useState(trace);
	const [camera, setCamera] = useState<Camera | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [followActive, setFollowActive] = useState(false);
	const [collapsedGroups, setCollapsedGroups] = useState<readonly string[]>([]);
	const [drilledGroup, setDrilledGroup] = useState<string | null>(null);

	// Same trace identity contract as usePlayer: reset before children render.
	if (identity !== trace) {
		setIdentity(trace);
		setCamera(null);
		setSelectedId(null);
		setFollowActive(false);
		setCollapsedGroups([]);
		setDrilledGroup(null);
	}

	const projected = frame ? projectScene(frame.state, trace.groups, { collapsedGroupIds: collapsedGroups }) : null;
	const projectedLayout = projected ? projectLayout(layout, projected) : layout;
	const visible = projected?.nodes.filter((node) => !node.summaryGroupId).map((node) => node.entity) ?? [];
	const selected = visible.find((entity) => entity.id === selectedId);
	const activeId = frame?.state.active
		.map(parseTarget)
		.map((target) => target?.id)
		.find((id): id is string => Boolean(
			id && projected?.nodes.some((node) => node.id === id || node.sourceEntityIds?.includes(id))
		));
	const activeNode = projected?.nodes.find((node) =>
		node.id === activeId || (activeId && node.sourceEntityIds?.includes(activeId))
	);
	const activeBox = activeNode ? projectedLayout.nodes[activeNode.id] : undefined;
	const overview = constrainCamera(layout, camera ?? fitCamera(layout));
	const effective = followActive && activeBox
		? focusCamera(layout, overview, activeBox)
		: overview;
	const effectiveRef = useRef(effective);
	effectiveRef.current = effective;

	const manual = (next: Camera) => {
		setCamera(constrainCamera(layout, next));
		setFollowActive(false);
	};
	const selectEntity = (id: string | null) => {
		setSelectedId(id);
		if (id && layout.nodes[id]) manual(focusCamera(layout, effectiveRef.current, layout.nodes[id]));
	};
	const fit = () => manual(fitCamera(layout));
	const toggleFollow = () => {
		if (followActive) {
			setCamera(effectiveRef.current);
			setFollowActive(false);
		} else {
			setFollowActive(true);
		}
	};

	const groupById = new Map((trace.groups ?? []).map((group) => [group.id ?? group.name, group]));
	// The original minimal flat-lane player remains unchanged by default.
	// Explicit group identity opts into hierarchy navigation controls.
	const hierarchyEnabled = trace.groups?.some((group) => group.id !== undefined || group.parentId !== undefined) ?? false;
	const availableGroups = hierarchyEnabled
		? projected?.groups.filter((group) => groupById.has(group.id)) ?? []
		: [];
	const crumbs: { id: string; name: string }[] = [];
	let currentGroup = drilledGroup ? groupById.get(drilledGroup) : undefined;
	const crumbKeys = new Set<string>();
	while (currentGroup && !crumbKeys.has(currentGroup.id ?? currentGroup.name)) {
		const id = currentGroup.id ?? currentGroup.name;
		crumbKeys.add(id);
		crumbs.unshift({ id, name: currentGroup.name });
		currentGroup = currentGroup.parentId ? groupById.get(currentGroup.parentId) : undefined;
	}
	const focusGroup = (id: string | null) => {
		setDrilledGroup(id);
		setSelectedId(null);
		if (!id) { manual(fitCamera(layout)); return; }
		const name = groupById.get(id)?.name;
		const box = layout.groups.find((candidate) => candidate.name === name);
		if (box) manual(focusCamera(layout, effectiveRef.current, box));
	};
	const toggleCollapse = (id: string) => {
		setCollapsedGroups((current) =>
			current.includes(id) ? current.filter((group) => group !== id) : [...current, id]
		);
		setSelectedId(null);
		setFollowActive(false);
	};
	const expandGroup = (id: string) => {
		setCollapsedGroups((current) => current.filter((group) => group !== id));
		focusGroup(id);
	};

	// Wheel must be non-passive so diagram zoom does not also scroll the page.
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg || !frame) return;
		const onWheel = (event: WheelEvent) => {
			// Browser-level zoom and scrolling at the zoom limits must remain native.
			if (event.ctrlKey || event.metaKey || !event.deltaY) return;
			const anchor = scenePoint(svg, event.clientX, event.clientY);
			if (!anchor) return;
			const factor = Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.002);
			const next = zoomCamera(layout, effectiveRef.current, factor, anchor);
			if (next.zoom === effectiveRef.current.zoom) return;
			event.preventDefault();
			setCamera(next);
			setFollowActive(false);
		};
		svg.addEventListener("wheel", onWheel, { passive: false });
		return () => svg.removeEventListener("wheel", onWheel);
	}, [frame, layout]);

	const beginGesture = (svg: SVGSVGElement) => {
		const inverse = svg.getScreenCTM()?.inverse();
		gesture.current = inverse
			? { camera: effectiveRef.current, inverse, start: new Map(pointers.current) }
			: null;
	};
	const onPointerDown: React.PointerEventHandler<SVGSVGElement> = (event) => {
		if (event.pointerType === "mouse" && event.button !== 0) return;
		if (!pointers.current.size) dragged.current = false;
		pointers.current.set(event.pointerId, point(event));
		const target = event.target as Element;
		pointerNodes.current.set(event.pointerId, target.closest("[data-node]")?.getAttribute("data-node") ?? null);
		pointerGroups.current.set(event.pointerId, target.closest("[data-group-summary]")?.getAttribute("data-group-summary") ?? null);
		beginGesture(event.currentTarget);
		if (typeof event.currentTarget.setPointerCapture === "function") {
			try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer already ended */ }
		}
	};
	const onPointerMove: React.PointerEventHandler<SVGSVGElement> = (event) => {
		if (!pointers.current.has(event.pointerId) || !gesture.current) return;
		pointers.current.set(event.pointerId, point(event));
		const start = [...gesture.current.start.values()];
		const now = [...pointers.current.values()];
		if (start.length !== now.length || !start.length) return;
		const base = gesture.current;
		const dragX = (now[0].x - start[0].x);
		const dragY = (now[0].y - start[0].y);
		if (Math.hypot(dragX, dragY) < 4 && now.length === 1 && !dragged.current) return;
		dragged.current = true;
		const worldDelta = (dx: number, dy: number) => ({
			x: dx * base.inverse.a + dy * base.inverse.c,
			y: dx * base.inverse.b + dy * base.inverse.d,
		});
		if (now.length >= 2) {
			const initialMid = midpoint(start[0], start[1]);
			const currentMid = midpoint(now[0], now[1]);
			const anchored = new DOMPoint(initialMid.x, initialMid.y).matrixTransform(base.inverse);
			const factor = distance(now[0], now[1]) / Math.max(1, distance(start[0], start[1]));
			const zoomed = zoomCamera(layout, base.camera, factor, anchored);
			const delta = worldDelta(currentMid.x - initialMid.x, currentMid.y - initialMid.y);
			// Midpoint motion is in screen pixels: after zooming, each pixel
			// covers fewer world units. Rebase the initial inverse accordingly.
			const scale = base.camera.zoom / zoomed.zoom;
			manual(panCamera(layout, zoomed, delta.x * scale, delta.y * scale));
		} else {
			const delta = worldDelta(dragX, dragY);
			manual(panCamera(layout, base.camera, delta.x, delta.y));
		}
	};
	const endPointer = (event: React.PointerEvent<SVGSVGElement>, cancelled: boolean) => {
		const node = pointerNodes.current.get(event.pointerId);
		const group = pointerGroups.current.get(event.pointerId);
		const wasSinglePointer = pointers.current.size === 1;
		pointers.current.delete(event.pointerId);
		pointerNodes.current.delete(event.pointerId);
		pointerGroups.current.delete(event.pointerId);
		if (!cancelled && wasSinglePointer && !dragged.current && node) selectEntity(node);
		if (!cancelled && wasSinglePointer && !dragged.current && group) expandGroup(group);
		if (pointers.current.size) beginGesture(event.currentTarget);
		else gesture.current = null;
		if (event.currentTarget.hasPointerCapture?.(event.pointerId))
			event.currentTarget.releasePointerCapture(event.pointerId);
	};
	const onKeyDown: React.KeyboardEventHandler<SVGSVGElement> = (event) => {
		if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
		const stepX = layout.width / effectiveRef.current.zoom / 10;
		const stepY = layout.height / effectiveRef.current.zoom / 10;
		let next: Camera | null = null;
		switch (event.key) {
			case "ArrowLeft": next = panCamera(layout, effectiveRef.current, stepX, 0); break;
			case "ArrowRight": next = panCamera(layout, effectiveRef.current, -stepX, 0); break;
			case "ArrowUp": next = panCamera(layout, effectiveRef.current, 0, stepY); break;
			case "ArrowDown": next = panCamera(layout, effectiveRef.current, 0, -stepY); break;
			case "+": case "=": next = zoomCamera(layout, effectiveRef.current, 1.25); break;
			case "-": next = zoomCamera(layout, effectiveRef.current, 0.8); break;
			case "0": next = fitCamera(layout); break;
		}
		if (!next) return;
		event.preventDefault();
		event.stopPropagation();
		manual(next);
	};

	if (!frame) return <p className="thl-empty">No steps to display.</p>;
	return (
		<>
			<div className="thl-viewport-tools" role="toolbar" aria-label="Diagram navigation">
				<select
					aria-label="Select entity"
					value={selected?.id ?? ""}
					onChange={(event) => selectEntity(event.target.value || null)}
				>
					<option value="">Select entity</option>
					{visible.map((entity) => <option key={entity.id} value={entity.id}>{entity.label} ({entity.id})</option>)}
				</select>
				<button type="button" aria-label="Zoom out" onClick={() => manual(zoomCamera(layout, effectiveRef.current, 0.8))} disabled={effective.zoom <= MIN_ZOOM}>−</button>
				<button type="button" aria-label="Zoom in" onClick={() => manual(zoomCamera(layout, effectiveRef.current, 1.25))} disabled={effective.zoom >= MAX_ZOOM}>+</button>
				<button type="button" aria-label="Fit to view" onClick={fit}>Fit</button>
				<button type="button" aria-label="Follow active entity" aria-pressed={followActive} onClick={toggleFollow}>Follow</button>
			</div>
			{availableGroups.length > 0 && (
				<nav className="thl-group-controls" aria-label="Group hierarchy">
					<button type="button" onClick={() => focusGroup(null)} aria-label="Return to group overview">Overview</button>
					{crumbs.map((group) => (
						<span key={group.id} className="thl-breadcrumb">
							<span aria-hidden="true">/</span>
							<button type="button" onClick={() => focusGroup(group.id)}>{group.name}</button>
						</span>
					))}
					<select
						aria-label="Drill into group"
						value={drilledGroup ?? ""}
						onChange={(event) => focusGroup(event.target.value || null)}
					>
						<option value="">Choose group</option>
						{availableGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
					</select>
					<button
						type="button"
						disabled={!drilledGroup}
						aria-label={drilledGroup && collapsedGroups.includes(drilledGroup) ? `Expand group ${groupById.get(drilledGroup)?.name}` : `Collapse group ${groupById.get(drilledGroup ?? "")?.name ?? ""}`}
						aria-expanded={drilledGroup ? !collapsedGroups.includes(drilledGroup) : undefined}
						onClick={() => { if (drilledGroup) toggleCollapse(drilledGroup); }}
					>
						{drilledGroup && collapsedGroups.includes(drilledGroup) ? "Expand" : "Collapse"}
					</button>
				</nav>
			)}
			<svg
				ref={svgRef}
				width="100%"
				height="100%"
				preserveAspectRatio="xMidYMid meet"
				viewBox={cameraViewBox(layout, effective)}
				role="img"
				aria-label={summary}
				aria-describedby={captionId}
				aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0"
				className="thl-scene"
				tabIndex={0}
				onKeyDown={onKeyDown}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={(event) => endPointer(event, false)}
				onPointerCancel={(event) => endPointer(event, true)}
				// Prevent selecting a node after a drag ends on the same SVG element.
				onClickCapture={(event) => { if (dragged.current) { event.stopPropagation(); dragged.current = false; } }}
			>
				<TraceScene
					frame={frame}
					previous={previous}
					layout={layout}
					groups={trace.groups}
					collapsedGroupIds={collapsedGroups}
					onExpandGroup={expandGroup}
					selectedId={selected?.id}
					onSelect={selectEntity}
				/>
			</svg>
			{selected && (
				<p className="thl-entity-status" aria-live="polite">
					Selected: {selected.label} ({selected.id}) — {format(selected.value)}
				</p>
			)}
		</>
	);
}
