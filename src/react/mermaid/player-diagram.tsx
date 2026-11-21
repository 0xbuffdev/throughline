import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Box } from "../../layout/types.js";
import type { Camera } from "../../layout/viewport.js";
import {
	cameraViewBox, fitCamera, fitScale, focusCamera, panCamera, zoomCamera,
} from "../../v2/graph-viewport.js";
import type { DiagramRendererProps } from "../graph-player.js";
import { PlayerIcon } from "../player-icons.js";
import { graphProof, sequenceProof, type DiagramProof } from "./adapter.js";
import { animateTransfers } from "./motion.js";
import { renderProof, type RenderedDiagram } from "./render.js";

const PARTICIPANT_LIMIT = 64;
const RELATION_LIMIT = 160;
const CACHE_LIMIT = 3;

function useDiagram(proof: DiagramProof | undefined, trace: DiagramRendererProps["trace"]) {
	const source = proof?.source;
	const cache = useRef(new Map<string, RenderedDiagram>());
	const [result, setResult] = useState<{ trace: typeof trace; source: string; diagram: RenderedDiagram | null }>();
	useEffect(() => {
		if (!proof || !source) return;
		const cached = cache.current.get(source);
		if (cached) {
			setResult({ trace, source, diagram: cached });
			return;
		}
		const request = new AbortController();
		void renderProof(proof, request.signal).then(diagram => {
			if (request.signal.aborted) return;
			cache.current.set(source, diagram);
			if (cache.current.size > CACHE_LIMIT)
				cache.current.delete(cache.current.keys().next().value!);
			setResult({ trace, source, diagram });
		}, () => {
			if (!request.signal.aborted) setResult({ trace, source, diagram: null });
		});
		return () => request.abort();
	// Source includes every geometry input and excludes current-frame paint.
	}, [source, trace]);
	const previous = result?.trace === trace ? result.diagram : undefined;
	return { current: source === result?.source ? previous : undefined, previous };
}

function itemBounds(scene: SVGSVGElement, targets: readonly string[]): Box | undefined {
	const screen = scene.getScreenCTM()?.inverse();
	if (!screen || !targets.length) return;
	const wanted = new Set(targets);
	const points = [...scene.querySelectorAll("[data-thl-item-id], [data-thl-region-id]")]
		.filter(node => wanted.has(node.getAttribute("data-thl-item-id") ?? node.getAttribute("data-thl-region-id") ?? ""))
		.flatMap(node => {
			const { left, top, right, bottom } = node.getBoundingClientRect();
			return [new DOMPoint(left, top).matrixTransform(screen), new DOMPoint(right, bottom).matrixTransform(screen)];
		});
	if (!points.length) return;
	const x = Math.min(...points.map(point => point.x)), y = Math.min(...points.map(point => point.y));
	return { x, y, w: Math.max(...points.map(point => point.x)) - x,
		h: Math.max(...points.map(point => point.y)) - y };
}

function GraphViewport({
	diagram, proof, focusIds, groupId, captionId, children, onOpenEvidence, follow, onFollowChange,
}: {
	diagram: RenderedDiagram;
	proof: DiagramProof;
	focusIds: DiagramRendererProps["focusIds"];
	groupId: DiagramRendererProps["groupId"];
	captionId: string;
	children: React.ReactNode;
	onOpenEvidence: () => void;
	follow: boolean;
	onFollowChange: (enabled: boolean) => void;
}): React.JSX.Element {
	const scene = useRef<SVGSVGElement>(null);
	const [size, setSize] = useState({ width: 720, height: 300 });
	const [camera, setCamera] = useState<Camera | null>(null);
	const [focused, setFocused] = useState<Box>();
	const drag = useRef<{ id: number; x: number; y: number } | null>(null);
	const fit = fitCamera(diagram, size);
	const initial = { ...fit, zoom: Math.max(0.8, fit.zoom) };
	const overview = camera ?? initial;
	const current = focused ? focusCamera(diagram, size, overview, focused) : overview;

	useEffect(() => {
		const svg = scene.current;
		if (!svg) return;
		const observer = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			if (width > 0 && height > 0) setSize({ width, height });
		});
		observer.observe(svg);
		return () => observer.disconnect();
	}, []);

	const group = groupId && proof.elements.find(entry => entry.source.groupIds?.[0] === groupId);
	const focusItems = proof.elements.filter(entry =>
		(entry.role === "entity" || entry.collapsed) && entry.source.entityIds?.some(id => focusIds.includes(id)));
	const targets = (follow && focusItems.length ? focusItems.map(entry => entry.itemId)
		: group ? [group.itemId] : []).join(" ");
	useEffect(() => {
		setFocused(targets && scene.current ? itemBounds(scene.current, targets.split(" ")) : undefined);
	}, [targets, diagram, size]);

	const [groupOverride, setGroupOverride] = useState<string | null>(null);
	const viewport = group && groupOverride === group.itemId && !follow ? overview : current;
	const manual = (next: Camera) => {
		onFollowChange(false);
		setGroupOverride(group ? group.itemId : null);
		setCamera(next);
	};
	const zoom = (factor: number, anchor?: DOMPoint) => manual(zoomCamera(diagram, size, viewport, factor, anchor));
	const pan = (dx: number, dy: number) => manual(panCamera(diagram, size, viewport, dx, dy));
	useEffect(() => { setGroupOverride(null); }, [groupId]);
	useEffect(() => {
		const svg = scene.current;
		if (!svg) return;
		const wheel = (event: WheelEvent) => {
			if (event.ctrlKey || event.metaKey || !event.deltaY) return;
			const matrix = svg.getScreenCTM()?.inverse();
			const anchor = matrix && new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
			const next = zoomCamera(diagram, size, viewport,
				Math.exp(-Math.max(-180, Math.min(180, event.deltaY)) / 300), anchor ?? undefined);
			if (next.zoom === viewport.zoom) return;
			event.preventDefault();
			manual(next);
		};
		svg.addEventListener("wheel", wheel, { passive: false });
		return () => svg.removeEventListener("wheel", wheel);
	}, [diagram, size, viewport, group]);

	return <div className="graph-wrap">
		<svg ref={scene} className="graph" role="group" tabIndex={0}
			aria-label="Source-linked graph at current frame" aria-describedby={captionId}
			viewBox={cameraViewBox(diagram, size, viewport)}
			onKeyDown={event => {
				if (event.target !== event.currentTarget) return;
				if (event.key === "+" || event.key === "=") zoom(1.25);
				else if (event.key === "-") zoom(0.8);
				else if (event.key === "0") manual(fit);
				else if (event.key === "ArrowLeft") pan(-30, 0);
				else if (event.key === "ArrowRight") pan(30, 0);
				else if (event.key === "ArrowUp") pan(0, -30);
				else if (event.key === "ArrowDown") pan(0, 30);
				else return;
				event.stopPropagation();
				event.preventDefault();
			}}
			onPointerDown={event => {
				if (event.button !== 0 || (event.target as Element).closest("[data-thl-item-id]")) return;
				drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerMove={event => {
				const previous = drag.current;
				if (!previous || previous.id !== event.pointerId) return;
				const scale = event.currentTarget.getScreenCTM()?.a ?? viewport.zoom;
				pan((event.clientX - previous.x) / scale, (event.clientY - previous.y) / scale);
				drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
			}}
			onLostPointerCapture={() => { drag.current = null; }}>
			{children}
		</svg>
		<div className="canvas-hint">
			<button className="mermaid-evidence" type="button" onClick={onOpenEvidence}>Changes and evidence</button>
			<div className="zoom-tools" role="toolbar" aria-label="Diagram navigation">
				<button type="button" aria-label="Follow active" aria-pressed={follow} title="Follow authored focus"
					onClick={() => { setCamera(viewport); onFollowChange(!follow); }}>
					<PlayerIcon name="focus" size={12}/>
				</button>
				<button type="button" aria-label="Zoom out" title="Zoom out"
					disabled={viewport.zoom <= fitScale(diagram, size)} onClick={() => zoom(0.8)}>
					<PlayerIcon name="minus" size={12}/>
				</button>
				<span className="zoom-readout">{Math.round(viewport.zoom * 100)}%</span>
				<button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1.25)}
					disabled={viewport.zoom >= 4}><PlayerIcon name="plus" size={12}/></button>
				<button type="button" aria-label="Fit to view" title="Fit to view" onClick={() => manual(fit)}>
					<PlayerIcon name="fit" size={12}/>
				</button>
			</div>
		</div>
	</div>;
}

export function MermaidPlayerDiagram({
	trace, view, frameIndex, width, selectedId, groupId, focusIds, captionId, motion, onSelectItem,
	onSelectEntity, onOpenEvidence, fallback,
}: DiagramRendererProps): React.JSX.Element {
	const direction = width < 520 ? "TB" : "LR";
	const [followedTrace, setFollowedTrace] = useState<typeof trace | null>(null);
	const [eventWindow, setEventWindow] = useState<{ trace: typeof trace; frame: number; start: number }>();
	const currentWindow = eventWindow?.trace === trace && eventWindow.frame === frameIndex
		? eventWindow : undefined;
	if (eventWindow && !currentWindow) setEventWindow(undefined);
	const proof = useMemo(() => {
		if (view.kind === "graph") {
			const entities = view.items.filter(item => item.role === "entity" || item.role === "group");
			const relations = view.items.filter(item => item.role === "relation");
			if (entities.length > PARTICIPANT_LIMIT || relations.length > RELATION_LIMIT) return;
			return graphProof(trace, view, direction);
		}
		const candidate = sequenceProof(trace, view, currentWindow?.start);
		if (candidate.elements.filter(entry => entry.role === "entity").length <= PARTICIPANT_LIMIT)
			return candidate;
	}, [trace, view, direction, currentWindow]);
	const { current: diagram, previous } = useDiagram(proof, trace);
	const host = useRef<HTMLDivElement>(null);
	const sequenceScroll = useRef<HTMLDivElement>(null);
	const { revision, forward, durationMs } = motion;
	const instruction = useRef<{ revision: number; source?: string; handled: boolean } | undefined>(undefined);
	useEffect(() => {
		if (!instruction.current || instruction.current.revision !== revision)
			instruction.current = { revision, source: proof?.source, handled: false };
		const current = instruction.current;
		if (!forward || current.source !== proof?.source) current.handled = true;
		if (!proof || !diagram || !host.current || current.handled) return;
		current.handled = true;
		const scroller = sequenceScroll.current;
		const lastSend = proof.kind === "sequence" && proof.elements.filter(entry => entry.current && entry.sent).at(-1);
		if (scroller && lastSend) {
			const route = host.current.querySelector('[data-thl-motion-item="' + lastSend.itemId + '"]');
			if (route) {
				const bounds = scroller.getBoundingClientRect();
				const position = route.getBoundingClientRect();
				if (position.bottom > bounds.bottom - 24 || position.top < bounds.top + 32)
					scroller.scrollTop += position.top - bounds.top - scroller.clientHeight / 2;
			}
		}
		const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
		const cancel = animateTransfers(host.current, proof, durationMs, true, preference.matches);
		preference.addEventListener("change", cancel);
		return () => { preference.removeEventListener("change", cancel); cancel(); };
	}, [revision, forward, durationMs, proof, diagram]);

	useEffect(() => {
		if (!diagram || !proof || !host.current) return;
		const active = new Set(proof.elements.filter(entry => entry.current).map(entry => entry.itemId));
		const selected = proof.elements.find(entry => entry.role === "entity" &&
			entry.source.entityIds?.includes(selectedId ?? ""))?.itemId;
		const focused = new Set(proof.elements.filter(entry =>
			(entry.role === "entity" || entry.collapsed) &&
			entry.source.entityIds?.some(id => focusIds.includes(id))).map(entry => entry.itemId));
		for (const node of host.current.querySelectorAll("[data-thl-item-id], [data-thl-motion-item]")) {
			const id = node.getAttribute("data-thl-item-id") ?? "";
			node.toggleAttribute("data-thl-active", active.has(node.getAttribute("data-thl-motion-item") ?? ""));
			node.toggleAttribute("data-thl-selected", id === selected);
			node.toggleAttribute("data-thl-focused", focused.has(id));
		}
	}, [diagram, proof, selectedId, focusIds]);

	const select = (event: React.SyntheticEvent) => {
		const id = (event.target as Element).closest("[data-thl-item-id]")?.getAttribute("data-thl-item-id");
		const entry = proof?.elements.find(item => item.itemId === id);
		if (!entry) return;
		event.preventDefault();
		event.stopPropagation();
		if (entry.role === "entity" && entry.source.entityIds?.[0]) onSelectEntity(entry.source.entityIds[0]);
		else onSelectItem(entry.itemId);
	};
	const interactive = {
		onClick: select,
		onKeyDown: (event: React.KeyboardEvent) => {
			if (event.key === "Enter" || event.key === " ") select(event);
		},
	};
	if (!proof || diagram === null) return <div className="mermaid-fallback">
		<div className="mermaid-status">
			<p role="status">{proof ? "The diagram couldn’t be rendered." : "This diagram exceeds the preview display limit."}</p>
			<button type="button" className="mermaid-evidence" onClick={onOpenEvidence}>Changes and evidence</button>
		</div>
		{fallback()}
	</div>;
	const visible = diagram ?? (proof.kind === "sequence" ? previous : undefined);
	if (!visible) return <p className="mermaid-loading" role="status">Preparing diagram…</p>;
	const markup = { __html: visible.svg };
	if (proof.kind === "sequence") return <div className="sequence-view mermaid-sequence" aria-busy={!diagram}>
		<div ref={sequenceScroll} className="mermaid-scroll" role="region" aria-label="Source-linked sequence at current frame"
			aria-describedby={captionId} tabIndex={0}>
			<div ref={host} className="mermaid-markup" data-mermaid-kind="sequence"
				data-mermaid-pending={diagram ? undefined : ""}
				{...interactive} dangerouslySetInnerHTML={markup}/>
		</div>
		<div className="mermaid-status">
			{proof.diagnostics.length > 0 && <nav className="mermaid-pages" aria-label="Sequence event windows">
				<button className="mermaid-evidence" type="button" disabled={!proof.start}
					onClick={() => setEventWindow({ trace, frame: frameIndex, start: proof.start - proof.visibleEvents })}>Earlier phases</button>
				<span>{proof.start + 1}–{proof.start + proof.visibleEvents} of {proof.totalEvents}</span>
				<button className="mermaid-evidence" type="button"
					disabled={proof.start + proof.visibleEvents >= proof.totalEvents}
					onClick={() => setEventWindow({ trace, frame: frameIndex, start: proof.start + proof.visibleEvents })}>Later phases</button>
			</nav>}
			<button type="button" className="mermaid-evidence" onClick={onOpenEvidence}>Changes and evidence</button>
		</div>
	</div>;
	return <div ref={host} className="mermaid-markup" data-mermaid-kind="graph">
		<GraphViewport key={proof.source} diagram={visible} proof={proof} focusIds={focusIds}
			groupId={groupId} captionId={captionId} onOpenEvidence={onOpenEvidence}
			follow={followedTrace === trace} onFollowChange={enabled => setFollowedTrace(enabled ? trace : null)}>
			<g {...interactive} dangerouslySetInnerHTML={markup}/>
		</GraphViewport>
	</div>;
}
