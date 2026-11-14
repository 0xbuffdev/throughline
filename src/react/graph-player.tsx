import { cn } from "cn";
import type * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
	cameraViewBox, constrainCamera, fitCamera, panCamera, zoomCamera,
	type Camera,
} from "../layout/viewport.js";
import { BASE_STEP_MS, stepDelayMs } from "../seek.js";
import { encodeJson } from "../v2/validator.js";
import { layoutGraph, layoutGraphView } from "../v2/graph-layout.js";
import { inspectTrace } from "../v2/inspector.js";
import type {
	Cell, CompiledTrace, Id, ViewDescriptor, ViewItem,
} from "../v2/model.js";
import { projectView } from "../v2/views.js";
import { PlayerControls, PlayerOptions } from "./controls.js";
import { useNarration } from "./use-narration.js";
import { usePlayer, useSceneWidth } from "./use-player.js";

export type ThroughlineGraphPlayerProps = {
	/** Only a compiler-owned, immutable schema-2 trace is accepted. */
	trace: CompiledTrace;
	title?: string;
	theme?: "auto" | "light" | "dark";
	className?: string;
	/** Native speech is opt-in and remains outside the pure core. */
	narration?: boolean;
};

function cellText(cell: Cell): string {
	return cell.status === "unknown"
		? "Unknown" + (cell.reason ? ": " + cell.reason : "")
		: encodeJson(cell.value);
}
function preview(text: string, length: number): string {
	return text.length <= length ? text : text.slice(0, length - 1) + "…";
}
function data(item: ViewItem, key: string): unknown {
	if (!item.data || typeof item.data !== "object" || Array.isArray(item.data))
		return undefined;
	return (item.data as Record<string, unknown>)[key];
}
function itemCell(item: ViewItem): Cell | null {
	const cell = data(item, "cell");
	if (!cell || typeof cell !== "object" ||
		!("status" in cell)) return null;
	return cell as Cell;
}

/** One semantic view descriptor, with no special-case v1 domain knowledge. */
function GraphDiagram({
	view, geometry, frameIndex, selectedId, onSelect, onExpand, visitedAt, participants, animate,
}: {
	view: ViewDescriptor;
	geometry: ReturnType<typeof layoutGraphView>;
	frameIndex: number;
	selectedId: Id | null;
	onSelect: (id: Id) => void;
	onExpand: (id: Id) => void;
	visitedAt: ReadonlyMap<Id, number>;
	participants: ReadonlySet<Id>;
	animate: boolean;
}): React.JSX.Element {
	const entityItems = view.items.filter(item => item.role === "entity");
	const groups = view.items.filter(item => item.role === "group");
	const links = view.items.filter(item => item.role === "relation");
	return (
		<>
			{groups.map(item => {
				const rect = geometry.groups.find(group => group.id === item.id);
				if (!rect) return null;
				return (
					<g key={item.id} data-group={item.source.groupIds?.[0]}
						data-source-group-ids={item.source.groupIds?.join(" ")}
						data-source-entity-ids={item.source.entityIds?.join(" ")}>
						<rect className="thl-group" x={rect.x} y={rect.y}
							width={rect.w} height={rect.h} rx={2} />
						<text className="thl-group-label" x={rect.x + 8} y={rect.y + 18}>
							{preview(item.label, Math.max(8, Math.floor((rect.w - 20) / 7)))}
						</text>
					</g>
				);
			})}
			{/* Lines are painted behind cards. Only explicitly authored sends
			    mark a current/traversed connector. Observed receive/processed
			    phases never acquire a sent class or motion on this path. */}
			{links.map(item => {
				const line = geometry.edges[item.id];
				if (!line) return null;
				const relationIds = item.source.relationIds ?? [];
				const sent = Number(data(item, "sentCurrent") ?? 0);
				const visited = relationIds.some(id =>
					(visitedAt.get(id) ?? Number.POSITIVE_INFINITY) <= frameIndex);
				const aggregated = Boolean(data(item, "aggregated"));
				return (
					<g key={item.id} className={cn("thl-link", {
						"thl-visited": visited,
						"thl-transferred": sent > 0,
						"thl-animate": animate && sent > 0,
						"thl-aggregate-active": aggregated && sent > 0,
						"thl-aggregate-visited": aggregated && visited,
					})} data-source-relation-ids={relationIds.join(" ")}
						data-source-event-ids={item.source.eventIds?.join(" ") ?? ""}
						data-sent-current={String(sent)}
						data-visited={String(visited)}>
						<title>{item.description}</title>
						<desc>{item.description}</desc>
						<path key={animate && sent > 0 ? "sent-" + frameIndex : "steady"}
							className="thl-edge" d={line.d} pathLength={1} />
						<polygon points="0,0 -7,-3.5 -7,3.5"
							transform={"translate(" + line.to[0] + "," + line.to[1] +
								") rotate(" + (line.angle * 180 / Math.PI) + ")"} />
						{line.labelVisible !== false && <text className="thl-edge-label"
							x={line.label[0]} y={line.label[1] - 8} textAnchor="middle">
							{preview(item.label, 24)}
						</text>}
					</g>
				);
			})}
			{groups.filter(item => data(item, "collapsed") === true).map(item => {
				const rect = geometry.nodes[item.id];
				if (!rect) return null;
				const group = item.source.groupIds?.[0] ?? "";
				const active = Boolean(item.source.entityIds?.includes(selectedId ?? ""));
				return (
					<g key={"summary-" + item.id} role="button" tabIndex={0}
						data-group-summary={group}
						data-source-group-ids={item.source.groupIds?.join(" ")}
						data-source-entity-ids={item.source.entityIds?.join(" ") ?? ""}
						data-source-relation-ids={item.source.relationIds?.join(" ") ?? ""}
						data-source-event-ids={item.source.eventIds?.join(" ") ?? ""}
						aria-label={"Expand group " + item.label}
						aria-expanded="false"
						transform={"translate(" + rect.x + "," + rect.y + ")"}
						onClick={() => onExpand(group)}
						onKeyDown={event => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								event.stopPropagation();
								onExpand(group);
							}
						}}>
						<title>{item.description}</title>
						<rect rx={2} width={rect.w} height={rect.h}
							className={cn("thl-summary-node", { "thl-selected": active })} />
						<rect className="thl-ring" x={-4} y={-4}
							width={rect.w + 8} height={rect.h + 8} rx={4}/>
						<text x={8} y={18} className="thl-node-label">{preview(item.label, 22)}</text>
						<text x={8} y={38} className="thl-summary-count">
							{item.source.entityIds?.length ?? 0} present entities
						</text>
					</g>
				);
			})}
			{entityItems.map(item => {
				const rect = geometry.nodes[item.id];
				if (!rect) return null;
				const id = item.source.entityIds?.[0] ?? "";
				const value = itemCell(item);
				const focused = data(item, "focused") === true;
				const changed = data(item, "changed") === true;
				const selected = id === selectedId;
				const participating = participants.has(id);
				return (
					<g key={item.id} role="button" tabIndex={0}
						data-node={id} data-source-entity-ids={id}
						data-source-event-ids={item.source.eventIds?.join(" ") ?? ""}
						aria-label={"Select " + item.label}
						aria-pressed={selected}
						transform={"translate(" + rect.x + "," + rect.y + ")"}
						onClick={() => onSelect(id)}
						onKeyDown={event => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault(); event.stopPropagation(); onSelect(id);
							}
						}}>
						<title>{item.description}</title>
						<rect rx={2} width={rect.w} height={rect.h}
							className={cn("thl-node", {
								"thl-selected": selected, "thl-focused": focused,
								"thl-visited": participating,
							})} />
						<rect className={cn("thl-ring", { "thl-ring-selected": selected })}
							x={-4} y={-4} width={rect.w + 8} height={rect.h + 8} rx={4}/>
						<text className="thl-node-label" x={8} y={19}>
							{preview(item.label, Math.floor((rect.w - 16) / 7))}
						</text>
						<text className={cn("thl-v2-value", { "thl-changed": changed })}
							x={8} y={44}>
							{preview(value ? cellText(value) : "Unknown", Math.floor((rect.w - 16) / 7.4))}
						</text>
						{changed && <text x={8} y={62} className="thl-v2-change">
							Explicit write
						</text>}
					</g>
				);
			})}
			{!entityItems.length && !groups.some(item => data(item, "collapsed") === true)
				&& <text className="thl-empty" textAnchor="middle"
					x={geometry.width / 2} y={50}>No present entities at this frame.</text>}
		</>
	);
}

/** Inert fallback; full source-linked history inspector UI is TL-U07. */
function StateFallback({ view, selectedId, onSelect }: {
	view: ViewDescriptor; selectedId: Id | null; onSelect: (id: Id) => void;
}): React.JSX.Element {
	return (
		<div className="thl-v2-fallback" role="region" aria-label="State and event table">
			{view.diagnostics?.map(diagnostic =>
				<p key={diagnostic} role="note">{diagnostic}</p>)}
			<table>
				<caption>Modeled state at {view.frameId}</caption>
				<thead><tr><th scope="col">Entity</th><th scope="col">Presence</th><th scope="col">Value</th></tr></thead>
				<tbody>{view.items.filter(item => item.role === "value").map(item => {
					const id = item.source.entityIds?.[0] ?? "";
					const cell = itemCell(item);
					return <tr key={item.id}>
						<th scope="row"><button type="button" aria-pressed={selectedId === id}
							onClick={() => onSelect(id)}>{item.label}</button></th>
						<td>{data(item, "present") ? "Present" : "Not present"}</td>
						<td><code>{cell ? cellText(cell) : "Unknown"}</code></td>
					</tr>;
				})}</tbody>
			</table>
		</div>
	);
}

/**
 * Native schema-2 React player. Reuses tested transport, speech ownership,
 * viewport mathematics, edge routing and CSS; never converts v2 semantic data
 * into v1 Program/Trace or accepts a compatibility adapter.
 *
 * The view may be Graph or the explicitly diagnosed fallback state/event
 * table. Sequence and full Inspect UI are separate TL-U06/TL-U07 work.
 */
export function ThroughlineGraphPlayer({
	trace, title, className, theme = "auto", narration = false,
}: ThroughlineGraphPlayerProps): React.JSX.Element {
	const inspector = useMemo(() => inspectTrace(trace), [trace]);
	const canvasRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const width = useSceneWidth(canvasRef);
	const [narrating, setNarrating] = useState(false);
	const { state, dispatch, lastAction, seekRevision, onKeyDown } =
		usePlayer(trace, narration && narrating);
	const [identity, setIdentity] = useState(trace);
	const [selectedId, setSelectedId] = useState<Id | null>(null);
	const [collapsed, setCollapsed] = useState<readonly Id[]>([]);
	const [viewKind, setViewKind] = useState<"graph" | "state-table">("graph");
	const [camera, setCamera] = useState<Camera | null>(null);
	const [fullscreen, setFullscreen] = useState(false);
	const [fullscreenError, setFullscreenError] = useState<string | null>(null);
	if (identity !== trace) {
		setIdentity(trace);
		setSelectedId(null);
		setCollapsed([]);
		setCamera(null);
		setViewKind("graph");
		setNarrating(false);
	}
	useEffect(() => {
		if (!narration) setNarrating(false);
	}, [narration]);
	const [motion, setMotion] = useState({ trace, step: state.step, animate: false });
	if (motion.trace !== trace || motion.step !== state.step) {
		setMotion({
			trace, step: state.step,
			animate: motion.trace === trace && state.step === motion.step + 1 &&
				(lastAction?.type === "tick" ||
					(lastAction?.type === "step" && lastAction.animate === true)),
		});
	}
	const layout = useMemo(() => layoutGraph(trace, width), [trace, width]);
	const view = useMemo(() => projectView(inspector, {
		kind: viewKind, frameIndex: state.step,
		selectedEntityIds: selectedId ? [selectedId] : [],
		collapsedGroupIds: collapsed,
	}), [inspector, state.step, viewKind, selectedId, collapsed]);
	const geometry = useMemo(() => layoutGraphView(layout, view), [layout, view]);
	const effectiveCamera = constrainCamera(layout, camera ?? fitCamera(layout));
	const visible = new Set(view.items.filter(item => item.role === "entity")
		.flatMap(item => item.source.entityIds ?? []));
	const selected = selectedId
		? trace.artifact.entities.find(entity => entity.id === selectedId)
		: undefined;
	const selectedValue = selected ? inspector.valueAt(state.step, selected.id) : null;
	const events = view.items.filter(item => item.role === "event");
	const step = state.step ? trace.artifact.steps[state.step - 1] : undefined;
	const summary = "Step " + (state.step + 1) + " of " + trace.frames.length +
		": " + (step?.label ?? "Initial state") + ". " + view.summary;
	const spoken = summary + (step?.note ? " " + step.note : "");
	const voice = useNarration({
		trace, step: state.step, text: spoken, seekRevision,
		speed: state.speed, playing: state.playing,
		enabled: narration && narrating, setEnabled: setNarrating,
		dispatch, offered: narration,
	});
	const firstSent = useMemo(() => {
		const seen = new Map<Id, number>();
		for (const [index, step] of trace.artifact.steps.entries())
			for (const event of step.events) {
				if (event.type === "message" && event.phase === "sent" &&
					!seen.has(event.relationId)) seen.set(event.relationId, index + 1);
			}
		return seen;
	}, [trace]);
	const participants = useMemo(() => {
		const present = new Set<Id>();
		for (const relation of trace.artifact.relations) {
			if ((firstSent.get(relation.id) ?? Infinity) <= state.step) {
				present.add(relation.from);
				present.add(relation.to);
			}
		}
		return present;
	}, [firstSent, state.step, trace]);
	const manual = (next: Camera) => setCamera(constrainCamera(layout, next));
	const fit = () => manual(fitCamera(layout));
	const zoom = (factor: number) => manual(zoomCamera(layout, effectiveCamera, factor));
	const pan = (dx: number, dy: number) => manual(panCamera(layout, effectiveCamera, dx, dy));
	const dragging = useRef<{ x: number; y: number; pointerId: number } | null>(null);
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg || view.kind !== "graph") return;
		const wheel = (event: WheelEvent) => {
			if (event.ctrlKey || event.metaKey || !event.deltaY) return;
			const factor = Math.exp(-Math.max(-180, Math.min(180, event.deltaY)) / 300);
			const next = zoomCamera(layout, effectiveCamera, factor);
			if (next.zoom === effectiveCamera.zoom) return;
			event.preventDefault();
			manual(next);
		};
		svg.addEventListener("wheel", wheel, { passive: false });
		return () => svg.removeEventListener("wheel", wheel);
	}, [layout, effectiveCamera, view.kind]);
	useEffect(() => {
		const sync = () => setFullscreen(document.fullscreenElement === rootRef.current);
		sync();
		document.addEventListener("fullscreenchange", sync);
		return () => document.removeEventListener("fullscreenchange", sync);
	}, []);
	const toggleFullscreen = async () => {
		if (!rootRef.current || !document.fullscreenEnabled) return;
		setFullscreenError(null);
		try {
			if (document.fullscreenElement === rootRef.current)
				await document.exitFullscreen();
			else if (!document.fullscreenElement)
				await rootRef.current.requestFullscreen();
		} catch {
			setFullscreenError("Fullscreen is unavailable in this browser or embedded view.");
		}
	};
	const controls = (
		<>
			<label className="thl-v2-field">View
				<select aria-label="Visualization view" value={viewKind}
					onChange={event => setViewKind(event.currentTarget.value as "graph" | "state-table")}>
					<option value="graph">Graph</option>
					<option value="state-table">State table</option>
				</select>
			</label>
			<label className="thl-v2-field">Selected entity
				<select aria-label="Select entity" value={selectedId ?? ""}
					onChange={event => setSelectedId(event.currentTarget.value || null)}>
					<option value="">None</option>
					{trace.artifact.entities.map(entity =>
						<option key={entity.id} value={entity.id}>{entity.label}</option>)}
				</select>
			</label>
			{(trace.artifact.groups ?? []).map(group =>
				<button type="button" key={group.id} aria-pressed={collapsed.includes(group.id)}
					onClick={() => setCollapsed(current => current.includes(group.id)
						? current.filter(id => id !== group.id) : [...current, group.id])}>
					{collapsed.includes(group.id) ? "Expand " : "Collapse "}{group.label}
				</button>)}
		</>
	);
	const keyboardDiagram: React.KeyboardEventHandler<SVGSVGElement> = (event) => {
		if (event.target !== event.currentTarget) return;
		const key = event.key;
		if (key === "+" || key === "=") zoom(1.25);
		else if (key === "-") zoom(1 / 1.25);
		else if (key === "0") fit();
		else if (key === "ArrowLeft") pan(-30, 0);
		else if (key === "ArrowRight") pan(30, 0);
		else if (key === "ArrowUp") pan(0, -30);
		else if (key === "ArrowDown") pan(0, 30);
		else return;
		event.preventDefault();
		event.stopPropagation();
	};
	const helpId = useId();
	const captionId = useId();
	return (
		<div ref={rootRef} className={cn("thl", "thl-v2", className)}
			data-theme={theme} role="group" aria-label="Visualization player"
			aria-describedby={helpId} aria-keyshortcuts="ArrowLeft ArrowRight Home End Space"
			tabIndex={0} onKeyDown={onKeyDown}
			style={{ "--thl-step-ms": stepDelayMs(BASE_STEP_MS, state.speed) + "ms" } as React.CSSProperties}>
			<p id={helpId} className="thl-sr-only">
				Focus this player to seek with Left and Right arrows, Home and End,
				and play or pause with Space. Focus the graph to pan with arrows,
				zoom with plus or minus, or fit with zero.
			</p>
			<p className="thl-sr-only" role="status" aria-atomic="true">{summary}</p>
			{voice.error && narration && <p role="alert">{voice.error}</p>}
			{fullscreenError && <p role="alert">{fullscreenError}</p>}
			<header className="thl-header">
				<h2 className="thl-title">{title ?? trace.artifact.title ?? "Throughline"}</h2>
				<PlayerOptions state={state} dispatch={dispatch} diagramControls={controls}
					narration={narration ? {
						enabled: narrating, available: voice.available, toggle: voice.toggle,
					} : undefined}
					fullscreen={{
						active: fullscreen, available: typeof document !== "undefined" &&
							Boolean(document.fullscreenEnabled), toggle: toggleFullscreen,
					}}/>
			</header>
			<div className="thl-stage">
				<div className="thl-viewport">
					<div className="thl-viewport-tools" role="group" aria-label="Graph camera controls">
						<button type="button" aria-label="Zoom in"
							disabled={view.kind !== "graph"} onClick={() => zoom(1.25)}>+</button>
						<button type="button" aria-label="Zoom out"
							disabled={view.kind !== "graph"} onClick={() => zoom(1 / 1.25)}>−</button>
						<button type="button" aria-label="Fit to view"
							disabled={view.kind !== "graph"} onClick={fit}>Fit</button>
					</div>
					<div className="thl-canvas" ref={canvasRef}>
						{view.kind === "graph" ? <svg ref={svgRef}
							className="thl-scene thl-v2-diagram"
							width="100%" height="100%" viewBox={cameraViewBox(layout, effectiveCamera)}
							role="img" tabIndex={0} aria-label="Source-linked graph at current frame"
							aria-describedby={captionId}
							onKeyDown={keyboardDiagram}
							onPointerDown={event => {
								if (event.button !== 0) return;
								dragging.current = { pointerId: event.pointerId,
									x: event.clientX, y: event.clientY };
								event.currentTarget.setPointerCapture(event.pointerId);
							}}
							onPointerMove={event => {
								const start = dragging.current;
								if (!start || start.pointerId !== event.pointerId) return;
								const bounds = event.currentTarget.getBoundingClientRect();
								const worldX = effectiveCamera.zoom > 0
									? (layout.width / effectiveCamera.zoom) / Math.max(bounds.width, 1) : 1;
								const worldY = effectiveCamera.zoom > 0
									? (layout.height / effectiveCamera.zoom) / Math.max(bounds.height, 1) : 1;
								pan((event.clientX - start.x) * worldX,
									(event.clientY - start.y) * worldY);
								dragging.current = { ...start, x: event.clientX, y: event.clientY };
							}}
							onPointerUp={() => { dragging.current = null; }}
							onPointerCancel={() => { dragging.current = null; }}>
							<title>{title ?? trace.artifact.title ?? "Throughline graph"}</title>
							<desc>{view.summary}</desc>
							<GraphDiagram view={view} geometry={geometry} frameIndex={state.step}
								selectedId={selectedId}
								onSelect={setSelectedId}
								onExpand={id => setCollapsed(current =>
									current.filter(item => item !== id))}
								visitedAt={firstSent} participants={participants} animate={motion.animate} />
						</svg> : <StateFallback view={view}
							selectedId={selectedId} onSelect={setSelectedId} />}
					</div>
				</div>
				<div className="thl-bottom">
					<PlayerControls state={state} dispatch={dispatch}/>
				</div>
				<details id={captionId} className="thl-v2-caption" open>
					<summary>{step?.label ?? "Initial state"} — Step {state.step + 1}/{trace.frames.length}</summary>
					<p>{step?.note ?? view.summary}</p>
					{events.length > 0 && <ol aria-label="Authored step evidence">
						{events.slice(0, 80).map(item =>
							<li key={item.id} data-source-event-ids={item.source.eventIds?.join(" ")}>
								{item.description}
							</li>)}
						{events.length > 80 && <li>
							{events.length - 80} additional authored event(s); use the typed inspector to query all sources.
						</li>}
					</ol>}
				</details>
				{selected && <section className="thl-v2-selection" aria-label="Selected entity">
					<h3>Selected: {selected.label}</h3>
					<p>{visible.has(selected.id) ? "Present in the graph" :
						"Not currently visible in the graph; no presence is inferred."}</p>
					<pre>{selectedValue && selectedValue.status === "known"
						? cellText(selectedValue) : selectedValue?.status === "unknown"
							? "Unknown" + (selectedValue.reason ? ": " + selectedValue.reason : "")
							: "Absent"}</pre>
				</section>}
			</div>
		</div>
	);
}
