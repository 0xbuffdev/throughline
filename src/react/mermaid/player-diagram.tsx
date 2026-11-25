import type * as React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Box } from "../../layout/types.js";
import type { Camera } from "../../layout/viewport.js";
import {
	cameraViewBox, fitCamera, fitScale, focusCamera, panCamera, zoomCamera,
} from "../../v2/graph-viewport.js";
import type { DiagramRendererProps } from "../graph-player.js";
import { PlayerIcon } from "../player-icons.js";
import { graphProof, property, sequenceProof, type DiagramProof } from "./adapter.js";
import type { Cell } from "../../v2/model.js";
import { summarizeCell } from "../value-display.js";
import { animateTransfers, paintRoutes } from "./motion.js";
import { renderProof, type RenderedDiagram } from "./render.js";

const PARTICIPANT_LIMIT = 64;
const RELATION_LIMIT = 160;
const CACHE_LIMIT = 3;

function useDiagram(proof: DiagramProof | undefined, trace: DiagramRendererProps["trace"], frameIndex: number,
	renderDiagram: typeof renderProof) {
	const source = proof?.source;
	const [attempt, setAttempt] = useState(0);
	const cache = useRef(new Map<string, RenderedDiagram>());
	const [result, setResult] = useState<{
		trace: typeof trace; source: string; kind: DiagramProof["kind"]; diagram: RenderedDiagram | null; frame: number; attempt: number;
	}>();
	useEffect(() => {
		if (!proof || !source) return;
		const rendered = { trace, source, kind: proof.kind, frame: frameIndex, attempt };
		const cached = cache.current.get(source);
		if (cached) {
			setResult({ ...rendered, diagram: cached });
			return;
		}
		const request = new AbortController();
		void renderDiagram(proof, request.signal).then(diagram => {
			if (request.signal.aborted) return;
			cache.current.set(source, diagram);
			if (cache.current.size > CACHE_LIMIT)
				cache.current.delete(cache.current.keys().next().value!);
			setResult({ ...rendered, diagram });
		}, () => {
			if (!request.signal.aborted) setResult({ ...rendered, diagram: null });
		});
		return () => request.abort();
	// Source includes every geometry input and excludes current-frame paint.
	}, [source, trace, renderDiagram, attempt]);
	const sameView = result?.trace === trace && result.kind === proof?.kind;
	return {
		current: sameView && source === result.source && result.attempt === attempt ? result.diagram : undefined,
		previous: sameView && result.attempt === attempt && frameIndex >= result.frame ? result.diagram : undefined,
		retry: () => setAttempt(value => value + 1),
	};
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

function keepInView(diagram: RenderedDiagram, size: { width: number; height: number },
	camera: Camera, bounds: Box, preferredZoom: number): Camera {
	const zoom = Math.max(fitScale(diagram, size), Math.min(preferredZoom,
		(size.width - 24) / Math.max(1, bounds.w), (size.height - 24) / Math.max(1, bounds.h)));
	const halfWidth = size.width / (2 * camera.zoom);
	const halfHeight = size.height / (2 * camera.zoom);
	const margin = 12 / camera.zoom;
	if (zoom === camera.zoom && bounds.x >= camera.centerX - halfWidth + margin &&
		bounds.x + bounds.w <= camera.centerX + halfWidth - margin &&
		bounds.y >= camera.centerY - halfHeight + margin &&
		bounds.y + bounds.h <= camera.centerY + halfHeight - margin) return camera;
	return { centerX: bounds.x + bounds.w / 2, centerY: bounds.y + bounds.h / 2, zoom };
}

function GraphViewport({
	diagram, proof, groupId, captionId, children, stateEvidence, onOpenEvidence, follow, onFollowChange,
}: {
	diagram: RenderedDiagram;
	proof: DiagramProof;
	groupId: DiagramRendererProps["groupId"];
	captionId: string;
	children: React.ReactNode;
	stateEvidence: React.ReactNode;
	onOpenEvidence: () => void;
	follow: boolean;
	onFollowChange: (enabled: boolean) => void;
}): React.JSX.Element {
	const scene = useRef<SVGSVGElement>(null);
	const [size, setSize] = useState({ width: 720, height: 300 });
	const [camera, setCamera] = useState<Camera | null>(null);
	const [region, setRegion] = useState<Box>();
	const [followScale, setFollowScale] = useState<number>();
	const drag = useRef<{ id: number; x: number; y: number } | null>(null);
	const fit = fitCamera(diagram, size);
	const initial = { ...fit, zoom: Math.max(0.82, fit.zoom) };
	const overview = camera ?? initial;

	useLayoutEffect(() => {
		const svg = scene.current;
		if (!svg) return;
		const setViewportSize = ({ width, height }: { width: number; height: number }) => {
			if (width > 0 && height > 0) setSize(previous =>
				previous.width === width && previous.height === height ? previous : { width, height });
		};
		setViewportSize(svg.getBoundingClientRect());
		const observer = new ResizeObserver(([entry]) => {
			setViewportSize(entry.contentRect);
		});
		observer.observe(svg);
		return () => observer.disconnect();
	}, []);

	const group = groupId && proof.elements.find(entry => entry.source.groupIds?.[0] === groupId);
	const targets = proof.elements.filter(entry => entry.role === "relation" && (entry.current || entry.context))
		.flatMap(entry => [entry.itemId, entry.fromItemId!, entry.toItemId!]).join(" ");
	useEffect(() => {
		if (!follow || !targets || !scene.current) return;
		const bounds = itemBounds(scene.current, targets.split(" "));
		if (!bounds) return;
		setCamera(previous => {
			const before = previous ?? initial;
			const next = keepInView(diagram, size, before, bounds, followScale ?? initial.zoom);
			return before === next ? previous : next;
		});
	}, [follow, targets, diagram, size, followScale]);
	useEffect(() => {
		setRegion(group && scene.current ? itemBounds(scene.current, [group.itemId]) : undefined);
	}, [group && group.itemId, diagram, size]);

	const [groupOverride, setGroupOverride] = useState<string | null>(null);
	const viewport = group && groupOverride !== group.itemId && region
		? focusCamera(diagram, size, overview, region) : overview;
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
		{stateEvidence}
		<div className="canvas-hint">
			<button className="diagram-evidence-action" type="button" onClick={onOpenEvidence}>Changes and evidence</button>
			<div className="zoom-tools" role="toolbar" aria-label="Diagram navigation">
				<button type="button" aria-label="Follow transfers" aria-pressed={follow} title="Keep active routes in view"
					onClick={() => { setCamera(viewport); setFollowScale(viewport.zoom); onFollowChange(!follow); }}>
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

function scrollToSequenceMark(scroller: HTMLElement, host: HTMLElement,
	current: DiagramProof["elements"][number], animate: boolean): void {
	const mark = host.querySelector<SVGGraphicsElement>(
		'[data-thl-motion-item="' + current.itemId + '"], [data-thl-phase-item="' + current.itemId + '"]');
	if (!mark) return;
	const viewport = scroller.getBoundingClientRect(), bounds = mark.getBoundingClientRect();
	const header = host.querySelector("[data-thl-sequence-header]")?.getBoundingClientRect();
	const caption = host.querySelector('[data-thl-motion-label="' + current.itemId + '"], [data-thl-phase-item="' +
		current.itemId + '"] .noteText')?.getBoundingClientRect();
	const top = Math.min(bounds.top, caption?.top ?? bounds.top);
	const margin = 12;
	const bottomLimit = viewport.top + scroller.clientHeight - margin;
	const topLimit = (header?.bottom ?? viewport.top) + margin;
	if (bounds.bottom > bottomLimit) scroller.scrollTop += bounds.bottom - bottomLimit + margin;
	else if (top < topLimit) scroller.scrollTop += top - topLimit;

	const participantBounds = (id: string | undefined) => id
		? host.querySelector('[data-thl-sequence-header] [data-thl-item-id="' + id + '"]')?.getBoundingClientRect()
		: undefined;
	const sender = participantBounds(current.fromItemId);
	const recipient = participantBounds(current.toItemId);
	const span = {
		left: Math.min(bounds.left, sender?.left ?? Infinity, recipient?.left ?? Infinity),
		right: Math.max(bounds.right, sender?.right ?? -Infinity, recipient?.right ?? -Infinity),
	};
	const availableWidth = scroller.clientWidth - margin * 2;
	let focus = span.right - span.left <= availableWidth ? span : bounds;
	if (bounds.width > availableWidth) {
		focus = (current.sent ? (animate ? sender : recipient) : caption) ?? bounds;
	}
	const left = viewport.left + margin, right = viewport.left + scroller.clientWidth - margin;
	if (focus.left < left) scroller.scrollLeft += focus.left - left;
	else if (focus.right > right) scroller.scrollLeft += focus.right - right;
}

function pinSequenceHeader(scroller: HTMLElement, host: HTMLElement): void {
	const header = host.querySelector<SVGGElement>("[data-thl-sequence-header]");
	const scale = header?.ownerSVGElement?.getScreenCTM()?.d || 1;
	header?.setAttribute("transform", "translate(0 " + scroller.scrollTop / scale + ")");
}

/** Internal adapter factory. Production uses renderProof; tests can inject a
 * deterministic asynchronous renderer rejection without replacing the player. */
export function createMermaidPlayerDiagram(renderDiagram: typeof renderProof) {
	return function Renderer(props: DiagramRendererProps): React.JSX.Element {
		return <MermaidPlayerDiagramImpl {...props} renderDiagram={renderDiagram}/>;
	};
}

export const MermaidPlayerDiagram = createMermaidPlayerDiagram(renderProof);

function MermaidPlayerDiagramImpl({
	trace, view, frameIndex, width, selectedId, groupId, captionId, firstSent, motion, onSelectItem,
	onSelectEntity, onOpenEvidence, fallback, renderDiagram,
}: DiagramRendererProps & { renderDiagram: typeof renderProof }): React.JSX.Element {
	const direction = width < 520 ? "TB" : "LR";
	const [unfollowedTrace, setUnfollowedTrace] = useState<typeof trace | null>(null);
	const [eventWindow, setEventWindow] = useState<{ trace: typeof trace; frame: number; start: number }>();
	const currentWindow = eventWindow?.trace === trace && eventWindow.frame === frameIndex
		? eventWindow : undefined;
	if (eventWindow && !currentWindow) setEventWindow(undefined);
	const proof = useMemo(() => {
		if (view.kind === "graph") {
			const entities = view.items.filter(item => item.role === "entity" || item.role === "group");
			const relations = view.items.filter(item => item.role === "relation");
			if (entities.length > PARTICIPANT_LIMIT || relations.length > RELATION_LIMIT) return;
			const visited = new Set([...firstSent].filter(([, index]) => index < frameIndex).map(([id]) => id));
			return graphProof(trace, view, direction, visited);
		}
		const candidate = sequenceProof(trace, view, currentWindow?.start);
		if (candidate.elements.filter(entry => entry.role === "entity").length <= PARTICIPANT_LIMIT)
			return candidate;
	}, [trace, view, direction, currentWindow, firstSent, frameIndex]);
	const { current: diagram, previous, retry } = useDiagram(proof, trace, frameIndex, renderDiagram);
	const host = useRef<HTMLDivElement>(null);
	const sequenceScroll = useRef<HTMLDivElement>(null);
	const { revision, forward, durationMs } = motion;
	const visible = diagram ?? (proof?.kind === "sequence" ? previous : undefined);
	const currentSequence = proof?.kind === "sequence" ? proof.elements.filter(entry => entry.current) : undefined;
	const currentSend = currentSequence?.filter(entry => entry.sent).at(-1);
	const currentMark = currentSend ?? currentSequence?.at(-1) ??
		(!currentWindow && proof?.kind === "sequence" && proof.visibleEvents ? proof.elements.at(-1) : undefined);
	useLayoutEffect(() => {
		const scroller = sequenceScroll.current;
		const markup = host.current;
		if (!visible || proof?.kind !== "sequence" || !scroller || !markup) return;
		const pinHeader = () => pinSequenceHeader(scroller, markup);
		pinHeader();
		scroller.addEventListener("scroll", pinHeader, { passive: true });
		return () => scroller.removeEventListener("scroll", pinHeader);
	}, [visible]);

	useLayoutEffect(() => {
		if (!diagram || !proof || !host.current) return;
		const cleanup = paintRoutes(host.current, proof, selectedId);
		if (proof.kind === "graph") {
			const items = new Map(view.items.map(item => [item.id, item]));
			for (const node of host.current.querySelectorAll("[data-thl-item-id]")) {
				const item = items.get(node.getAttribute("data-thl-item-id") ?? "");
				if (item?.role !== "entity") continue;
				node.toggleAttribute("data-thl-focused", property(item, "focused") === true);
				node.toggleAttribute("data-thl-written", property(item, "changed") === true);
			}
		}
		return cleanup;
	}, [diagram, proof, selectedId, view]);

	useLayoutEffect(() => {
		if (!diagram || !proof || !host.current || !sequenceScroll.current) return;
		if (frameIndex === 0 || (currentWindow && !currentMark)) sequenceScroll.current.scrollTo(0, 0);
		else if (currentMark) scrollToSequenceMark(sequenceScroll.current, host.current, currentMark,
			forward && currentMark === currentSend && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
		pinSequenceHeader(sequenceScroll.current, host.current);
	}, [diagram, frameIndex, currentMark?.itemId, currentWindow?.start, width]);

	const instruction = useRef<{ revision: number; source?: string; handled: boolean } | undefined>(undefined);
	useEffect(() => {
		if (!instruction.current || instruction.current.revision !== revision)
			instruction.current = { revision, source: proof?.source, handled: false };
		const current = instruction.current;
		// A failed render consumes the old cue; manual retry is not a new step.
		if (!forward || current.source !== proof?.source || diagram === null) current.handled = true;
		if (!proof || !diagram || !host.current || current.handled) return;
		current.handled = true;
		const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
		const scroller = sequenceScroll.current;
		const cancel = animateTransfers(host.current, proof, durationMs, true, preference.matches,
			scroller && currentSend ? { scroller, itemId: currentSend.itemId } : undefined);
		preference.addEventListener("change", cancel);
		return () => { preference.removeEventListener("change", cancel); cancel(); };
	}, [revision, forward, durationMs, proof, diagram, currentSend]);

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
			{proof && <button type="button" className="diagram-evidence-action" onClick={retry}>Retry diagram</button>}
			<button type="button" className="diagram-evidence-action" onClick={onOpenEvidence}>Changes and evidence</button>
		</div>
		{fallback()}
	</div>;
	if (!visible) return <div className="mermaid-loading">
		<p role="status">Preparing {proof.kind === "graph" ? "graph" : "sequence"}…</p>
	</div>;
	const markup = { __html: visible.svg };
	if (proof.kind === "sequence") return <div className="sequence-view mermaid-sequence" aria-busy={!diagram}>
		<div ref={sequenceScroll} className="mermaid-scroll" role="region" aria-label="Source-linked sequence at current frame"
			aria-describedby={captionId} tabIndex={0}>
			<div ref={host} className="mermaid-markup" data-mermaid-kind="sequence"
				inert={!diagram} data-mermaid-pending={diagram ? undefined : ""}
				{...interactive} dangerouslySetInnerHTML={markup}/>
		</div>
		<div className="mermaid-status">
			{proof.diagnostics.length > 0 && <nav className="mermaid-pages" aria-label="Sequence event windows">
				<button className="diagram-evidence-action" type="button" disabled={!proof.start}
					onClick={() => setEventWindow({ trace, frame: frameIndex, start: proof.start - proof.visibleEvents })}>Earlier phases</button>
				<span>{proof.start + 1}–{proof.start + proof.visibleEvents} of {proof.totalEvents}</span>
				<button className="diagram-evidence-action" type="button"
					disabled={proof.start + proof.visibleEvents >= proof.totalEvents}
					onClick={() => setEventWindow({ trace, frame: frameIndex, start: proof.start + proof.visibleEvents })}>Later phases</button>
			</nav>}
			<button type="button" className="diagram-evidence-action" onClick={onOpenEvidence}>Changes and evidence</button>
		</div>
		{diagram && <details className="mermaid-source-references" style={{ flex: "0 0 auto", maxHeight: "25%", overflow: "auto" }}>
			<summary>Sequence source references</summary>
			<ul aria-label="Visible sequence source references">
				{proof.elements.filter(entry => entry.role === "event").map(entry => <li key={entry.itemId}>
					<button type="button" className="diagram-evidence-action"
						data-source-event-ids={entry.source.eventIds?.join(" ")}
						onClick={() => onSelectItem(entry.itemId)}>{entry.rowToken} · {entry.label}</button>
				</li>)}
			</ul>
		</details>}
	</div>;
	return <div ref={host} className="mermaid-markup" data-mermaid-kind="graph">
		<GraphViewport key={proof.source} diagram={visible} proof={proof}
			groupId={groupId} captionId={captionId} onOpenEvidence={onOpenEvidence}
			stateEvidence={<section className="mermaid-graph-state" role="region" aria-label="Graph modeled state" tabIndex={0}>
				{view.items.filter(item => item.role === "entity" || (item.role === "group" && property(item, "collapsed") === true)).map(item => {
					const group = item.role === "group";
					const focused = property(item, "focused") === true, changed = property(item, "changed") === true;
					const summary = group ? String(property(item, "count")) + " present entities" :
						"Present · " + summarizeCell(property(item, "cell") as Cell);
					return <button type="button" key={item.id} data-graph-state-item={item.id}
						data-source-entity-ids={item.source.entityIds?.join(" ")}
						data-source-event-ids={item.source.eventIds?.join(" ")}
						onClick={() => onSelectItem(item.id)}>
						<strong>{item.label}</strong> <span>{summary}</span>
						{focused && <span> · Focus</span>}{changed && <span> · Write</span>}
					</button>;
				})}
			</section>}
			follow={unfollowedTrace !== trace} onFollowChange={enabled => setUnfollowedTrace(enabled ? null : trace)}>
			<g {...interactive} dangerouslySetInnerHTML={markup}/>
		</GraphViewport>
	</div>;
}
