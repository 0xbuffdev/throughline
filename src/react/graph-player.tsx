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
	Cell, CompiledTrace, Id, ViewDescriptor, ViewItem, ViewKind,
} from "../v2/model.js";
import { projectView } from "../v2/views.js";
import { PlayerControls, PlayerOptions } from "./controls.js";
import { useNarration } from "./use-narration.js";
import { usePlayer, useSceneWidth } from "./use-player.js";
import { SequenceView } from "./sequence-view.js";
import { SequenceEvidence } from "./sequence-evidence.js";
import { InspectPanel } from "./inspect-panel.js";
import { PlayerIcon } from "./player-icons.js";

export type ThroughlineGraphPlayerProps = {
	/** Only a compiler-owned, immutable schema-2 trace is accepted. */
	trace: CompiledTrace;
	title?: string;
	theme?: "auto" | "light" | "dark";
	className?: string;
	/** Optional explicit override. If omitted, accepted artifact hint/auto
	 * selection determines the initial view consistently across all frames.
	 * Selecting another view in Player options is a deliberate manual override. */
	initialView?: ViewKind;
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
	const groupsById = new Map(groups.map(item => [item.id, item] as const));
	const links = view.items.filter(item => item.role === "relation");
	return (
		<>
			{/* Paint from the hierarchy layout's parent-first order, never
			    the artifact declaration order used by source descriptors. An
			    opaque ancestor panel otherwise obscures a child declared first. */}
			{geometry.groups.map(rect => {
				const item = rect.id && groupsById.get(rect.id);
				if (!item) return null;
				return (
					<g key={item.id} className="group-frame" data-group={item.source.groupIds?.[0]}
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
			{/* Lines are painted behind cards. Only explicit modeled sends
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
					<g key={item.id} className={cn("thl-link links", {
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
						className="entity summary"
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
						className={cn("entity", { "active": focused, "selected": selected })}
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
						<circle cx={12} cy={14} r={3} />
						<text className="thl-node-label entity-label" x={22} y={19}>
							{preview(item.label, Math.floor((rect.w - 16) / 7))}
						</text>
						<text className={cn("thl-v2-value entity-value", { "thl-changed": changed })}
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
/** The prototype's four-column state sheet, displaying real committed cells. */
function StateFallback({ view, selectedId, onSelect, inspector, frameIndex }: {
 view: ViewDescriptor;
 selectedId: Id | null;
 onSelect: (id: Id) => void;
 inspector: ReturnType<typeof inspectTrace>;
 frameIndex: number;
}): React.JSX.Element {
 const rows = view.items.filter(item => item.role === "value");
 const changed = new Set(inspector.diff(Math.max(0, frameIndex - 1), frameIndex)
  .filter(change => change.kind === "write").map(change => change.entityId));
 return <div className="state-view" role="region" aria-label="State and event table">
  {view.diagnostics?.map(message => <p key={message} role="note">{message}</p>)}
  <div className="state-row state-header" aria-hidden="true">
   <span>ENTITY</span><span>PATH</span><span>COMMITTED VALUE</span><span>ORIGIN</span>
  </div>
  {rows.map(item => {
   const id = item.source.entityIds?.[0] ?? "";
   const present = data(item, "present") === true;
   const cell = itemCell(item);
   const history = inspector.history(id);
   const latest = history.filter(entry => entry.frameIndex <= frameIndex).at(-1);
   const origin = latest?.originId ?? (present ? "initial" : "not present");
   return <button type="button" className={cn("state-row", {
    "changed": changed.has(id), "future": !present,
   })} key={item.id} data-source-entity-ids={id}
    aria-pressed={selectedId === id} onClick={() => onSelect(id)}>
    <strong>{item.label}</strong>
    <code>entity:{id}</code>
    <code>{present ? (cell ? cellText(cell) : "Unknown") : "Absent"}</code>
    <span>{origin}</span>
   </button>;
  })}
 </div>;
}

/**
 * Native schema-2 React player. Reuses tested transport, speech ownership,
 * viewport mathematics, edge routing and CSS; never converts v2 semantic data
 * into v1 Program/Trace or accepts a compatibility adapter.
 *
 * Graph, sequence and state-table share the SAME indexed inspector, source
 * IDs and playback frame, including the native Explain/Inspect interface.
 */
export function ThroughlineGraphPlayer({
	trace, title, className, theme = "auto", narration = false, initialView,
}: ThroughlineGraphPlayerProps): React.JSX.Element {
	const inspector = useMemo(() => inspectTrace(trace), [trace]);
	const canvasRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const width = useSceneWidth(canvasRef);
 // Match the prototype: on initially narrow embeds, follow authored action.
 useEffect(() => {
  if (followInitialized.current || !canvasRef.current) return;
  followInitialized.current = true;
  if (canvasRef.current.clientWidth < 640) setFollow(true);
 }, [width]);
	const [narrating, setNarrating] = useState(false);
	const { state, dispatch, lastAction, seekRevision, onKeyDown } =
		usePlayer(trace, narration && narrating);
	const [identity, setIdentity] = useState(trace);
	const [selectedId, setSelectedId] = useState<Id | null>(null);
	const [collapsed, setCollapsed] = useState<readonly Id[]>([]);
	const [viewKind, setViewKind] = useState<ViewKind | undefined>(initialView);
	const [inspectionMode, setInspectionMode] = useState<"explain" | "inspect">("explain");
 const [drilled, setDrilled] = useState<Id | null>(null);
 const [follow, setFollow] = useState(false);
 const [soundOn, setSoundOn] = useState(false);
 const [soundAvailable, setSoundAvailable] = useState(false);
 const audioRef = useRef<AudioContext | null>(null);
 const followInitialized = useRef(false);
	const [camera, setCamera] = useState<Camera | null>(null);
	const [fullscreen, setFullscreen] = useState(false);
	// Capability detection is client-only. SSR and the first hydration render
	// must agree before the mount effect enables fullscreen controls.
	const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
	const [fullscreenError, setFullscreenError] = useState<string | null>(null);
	if (identity !== trace) {
		setIdentity(trace);
		setSelectedId(null);
		setCollapsed([]);
		setCamera(null);
		setViewKind(initialView);
		setInspectionMode("explain");
  setDrilled(null);
  setFollow(false);
  followInitialized.current = false;
  setSoundOn(false);
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
	// On an identity change, usePlayer schedules its reset during render.
	// Never send the former trace's higher frame index into a new, shorter
	// immutable inspector while React completes that state transition.
	const frameIndex = Math.min(state.step, trace.frames.length - 1);
	const layout = useMemo(() => layoutGraph(trace, width), [trace, width]);
	const view = useMemo(() => projectView(inspector, {
		kind: viewKind, frameIndex,
		selectedEntityIds: selectedId ? [selectedId] : [],
		collapsedGroupIds: collapsed,
	}), [inspector, frameIndex, viewKind, selectedId, collapsed]);
	const geometry = useMemo(() => layoutGraphView(layout, view), [layout, view]);
	// Only authored focusEntityIds can drive automatic camera following.
 const focusIds = frameIndex ? trace.artifact.steps[frameIndex - 1].focusEntityIds ?? [] : [];
 const focusRects = focusIds.map(id => {
  const item = view.items.find(candidate => candidate.role === "entity" &&
   candidate.source.entityIds?.includes(id));
  return item ? geometry.nodes[item.id] : undefined;
 }).filter((rect): rect is { x: number; y: number; w: number; h: number } => rect !== undefined);
 const focusLeft = focusRects.length ? Math.min(...focusRects.map(rect => rect.x)) : 0;
 const focusRight = focusRects.length ? Math.max(...focusRects.map(rect => rect.x + rect.w)) : 0;
 const focusTop = focusRects.length ? Math.min(...focusRects.map(rect => rect.y)) : 0;
 const focusBottom = focusRects.length ? Math.max(...focusRects.map(rect => rect.y + rect.h)) : 0;
 const followedCamera: Camera | null = focusRects.length ? {
  centerX: (focusLeft + focusRight) / 2,
  centerY: (focusTop + focusBottom) / 2,
  zoom: Math.max(1, Math.min(2.4, 0.8 * Math.min(
   layout.width / Math.max(1, focusRight - focusLeft),
   layout.height / Math.max(1, focusBottom - focusTop),
  ))),
 } : null;
 const effectiveCamera = constrainCamera(layout,
  follow && followedCamera ? followedCamera : camera ?? fitCamera(layout));
	const presentEntities = new Set(inspector.stateAt(frameIndex).presentEntityIds);
	const selected = selectedId
		? trace.artifact.entities.find(entity => entity.id === selectedId)
		: undefined;
	const selectedValue = selected ? inspector.valueAt(frameIndex, selected.id) : null;
	const events = view.items.filter(item => item.role === "event" &&
		(view.kind !== "sequence" || data(item, "current") === true));
	const step = frameIndex ? trace.artifact.steps[frameIndex - 1] : undefined;
	const summary = "Step " + (frameIndex + 1) + " of " + trace.frames.length +
		": " + (step?.label ?? "Initial state") + ". " + view.summary;
	const spoken = summary + (step?.note ? " " + step.note : "");
	const voice = useNarration({
		trace, step: frameIndex, text: spoken, seekRevision,
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
			if ((firstSent.get(relation.id) ?? Infinity) <= frameIndex) {
				present.add(relation.from);
				present.add(relation.to);
			}
		}
		return present;
	}, [firstSent, frameIndex, trace]);
	const manual = (next: Camera) => { setFollow(false); setCamera(constrainCamera(layout, next)); };
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
		setFullscreenAvailable(Boolean(document.fullscreenEnabled));
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
	
 // Audio is optional, native, and instantiated only after an explicit click.
 useEffect(() => {
  setSoundAvailable(typeof window.AudioContext === "function");
  return () => { void audioRef.current?.close().catch(() => {}); };
 }, []);
 const toggleSound = () => {
  if (soundOn) { setSoundOn(false); return; }
  const Ctx = window.AudioContext;
  if (!Ctx) return;
  audioRef.current ??= new Ctx();
  void audioRef.current.resume().catch(() => {});
  setSoundOn(true);
 };
 useEffect(() => {
  if (!soundOn || !audioRef.current) return;
  const audio = audioRef.current;
  try {
   const oscillator = audio.createOscillator();
   const gain = audio.createGain();
   const now = audio.currentTime;
   oscillator.frequency.value = 220 * Math.pow(2, frameIndex / Math.max(1, state.max) * 1.5);
   gain.gain.setValueAtTime(0.0001, now);
   gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
   gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
   oscillator.connect(gain);
   gain.connect(audio.destination);
   oscillator.start();
   oscillator.stop(now + 0.32);
  } catch { /* audio is optional */ }
 }, [frameIndex, soundOn, state.max]);

 const entityFieldId = useId();
 const groupFieldId = useId();
 const helpId = useId();
 const captionId = useId();
 const currentEvent = step?.events[0];
 const eventType = !step ? "initial" : currentEvent?.type ?? "no event";
 const hasWrite = step?.events.some(event => event.type === "write") ?? false;
 const origins = [...new Set(trace.artifact.origins.map(origin => origin.kind))].join(" + ");
 const inspectSelected = selected ?? trace.artifact.entities[0];
 const inspectValue = inspectSelected ? inspector.valueAt(frameIndex, inspectSelected.id) : null;
 const inspectPresent = inspectSelected ? presentEntities.has(inspectSelected.id) : false;
 const inspectHistory = inspectSelected
  ? inspector.history(inspectSelected.id).filter(entry => entry.frameIndex <= frameIndex)
  : [];
 const onSelectEntity = (id: Id) => { setSelectedId(id); setInspectionMode("inspect"); };
 const focusEntity = (id: Id) => {
  onSelectEntity(id);
  const item = view.items.find(candidate => candidate.role === "entity" &&
   candidate.source.entityIds?.includes(id));
  const rect = item && geometry.nodes[item.id];
  if (rect && view.kind === "graph")
   manual({ centerX: rect.x + rect.w / 2, centerY: rect.y + rect.h / 2, zoom: 2 });
 };
 const focusGroup = (id: Id | null) => {
  setDrilled(id);
  if (!id) { fit(); return; }
  const item = view.items.find(candidate => candidate.role === "group" &&
   candidate.source.groupIds?.includes(id));
  const rect = item && (geometry.groups.find(rect => rect.id === item.id) ??
   geometry.nodes[item.id]);
  if (rect) manual({ centerX: rect.x + rect.w / 2, centerY: rect.y + rect.h / 2, zoom: 2 });
 };
 const diagramControls = <>
  <div className="opt-field">
   <label htmlFor={entityFieldId}>Select entity</label>
   <span className="opt-select">
    <select id={entityFieldId} aria-label="Select entity" value={selectedId ?? ""}
     onChange={event => { if (event.currentTarget.value) focusEntity(event.currentTarget.value); else setSelectedId(null); }}>
     <option value="">Choose entity</option>
     {trace.artifact.entities.map(entity =>
      <option value={entity.id} key={entity.id}>{entity.label} ({entity.id})</option>)}
    </select>
    <PlayerIcon name="chevron" size={12}/>
   </span>
  </div>
  <div className="opt-grid">
   <button type="button" className={"opt-toggle " + (follow ? "on" : "")}
    aria-pressed={follow} disabled={view.kind !== "graph"} onClick={() => {
     if (follow) { setCamera(effectiveCamera); setFollow(false); }
     else setFollow(true);
    }}>
    <PlayerIcon name="focus" size={14}/><span>Follow active</span>
   </button>
   <button type="button" className="opt-toggle" disabled={view.kind !== "graph"}
    onClick={fit}><PlayerIcon name="fit" size={14}/><span>Fit to view</span></button>
  </div>
  <nav className="group-nav" aria-label="Group hierarchy">
   <button type="button" className="opt-icon" aria-label="Return to group overview"
    onClick={() => focusGroup(null)}><PlayerIcon name="home" size={14}/></button>
   {drilled && <span className="crumb">/ {trace.artifact.groups?.find(group => group.id === drilled)?.label}</span>}
   <span className="opt-select grow">
    <select id={groupFieldId} aria-label="Drill into group" value={drilled ?? ""}
     disabled={view.kind !== "graph"}
     onChange={event => focusGroup(event.currentTarget.value || null)}>
     <option value="">Choose group</option>
     {(trace.artifact.groups ?? []).map(group =>
      <option key={group.id} value={group.id}>{group.label}</option>)}
    </select>
    <PlayerIcon name="chevron" size={12}/>
   </span>
   <button type="button" className="opt-icon" disabled={!drilled || view.kind !== "graph"}
    aria-label={drilled && collapsed.includes(drilled) ? "Expand group" : "Collapse group"}
    aria-expanded={drilled ? !collapsed.includes(drilled) : undefined}
    onClick={() => drilled && setCollapsed(current => current.includes(drilled)
     ? current.filter(id => id !== drilled) : [...current, drilled])}>
    <PlayerIcon name={drilled && collapsed.includes(drilled) ? "uncollapse" : "collapse"} size={14}/>
   </button>
  </nav>
 </>;
 const keyboardDiagram: React.KeyboardEventHandler<SVGSVGElement> = event => {
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
 return <div ref={rootRef} className={cn("thl", "thl-v2", "player-shell", className)}
  data-theme={theme} role="group" aria-label="Visualization player"
  aria-describedby={helpId} aria-keyshortcuts="ArrowLeft ArrowRight Home End Space"
  tabIndex={0} onKeyDown={onKeyDown}
  style={{ "--thl-step-ms": stepDelayMs(BASE_STEP_MS, state.speed) + "ms" } as React.CSSProperties}>
  <p id={helpId} className="thl-sr-only">Focus this player to seek with Left and Right arrows, Home and End,
   and play or pause with Space. Focus the graph to pan with arrows, zoom with plus or minus, or fit with zero.</p>
  <p className="thl-sr-only" role="status" aria-atomic="true">{summary}</p>
  {voice.error && narration && <p role="alert" className="narration-error">{voice.error}</p>}
  {fullscreenError && <p role="alert" className="narration-error">{fullscreenError}</p>}
  <header className="player-header">
   <div className="title-block">
    <h2>{title ?? trace.artifact.title ?? "Throughline"}</h2>
   </div>
   <div className="header-actions">
    <button type="button" className={inspectionMode === "inspect" ? "active" : ""}
     aria-pressed={inspectionMode === "inspect"} onClick={() => {
      if (inspectionMode === "explain" && !selectedId && trace.artifact.entities.length)
       setSelectedId(trace.artifact.entities[0].id);
      setInspectionMode(current => current === "inspect" ? "explain" : "inspect");
     }}><PlayerIcon name="inspect"/><span>Inspect</span></button>
    <PlayerOptions state={state} dispatch={dispatch} diagramControls={diagramControls}
     inspection={{ enabled: inspectionMode === "inspect",
      toggle: () => setInspectionMode(current => current === "inspect" ? "explain" : "inspect") }}
     sound={{ enabled: soundOn, available: soundAvailable, toggle: toggleSound }}
     narration={narration ? { enabled: narrating, available: voice.available, toggle: voice.toggle } : undefined}
     fullscreen={{ active: fullscreen, available: fullscreenAvailable, toggle: toggleFullscreen }}/>
   </div>
  </header>
  <div className="context-bar">
   <div className="view-tabs" role="tablist" aria-label="Visualization view">
    {([["Graph", "graph"], ["Sequence", "sequence"], ["State", "state-table"]] as const)
     .map(([label, kind]) => <button type="button" key={kind}
      role="tab" aria-selected={view.kind === kind}
      className={view.kind === kind ? "active" : ""}
      onClick={() => setViewKind(kind)}>{label}</button>)}
   </div>
   <div className="truth-note"><span>SOURCE</span> {origins} <i/> frame #{frameIndex}</div>
  </div>
  <div className={"player-content " + (inspectionMode === "inspect" ? "with-inspector" : "")}>
   <div className="canvas" ref={canvasRef}>
    <div className="canvas-meta">
     <span>FRAME {String(frameIndex).padStart(2, "0")}</span>
     <strong>{step?.label ?? "Initial state"}</strong>
     <code>{eventType}</code>
    </div>
    {view.kind === "graph" ?
     <div className="graph-wrap">
      <svg ref={svgRef} className="graph thl-v2-diagram" role="img" tabIndex={0}
       viewBox={cameraViewBox(layout, effectiveCamera)}
       aria-label="Source-linked graph at current frame"
       aria-describedby={captionId}
       onKeyDown={keyboardDiagram}
       onPointerDown={event => {
        if (event.button !== 0) return;
        if ((event.target as Element).closest('[data-node], [data-group-summary]')) return;
        dragging.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
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
        pan((event.clientX - start.x) * worldX, (event.clientY - start.y) * worldY);
        dragging.current = { ...start, x: event.clientX, y: event.clientY };
       }}
       onPointerUp={() => { dragging.current = null; }}
       onPointerCancel={() => { dragging.current = null; }}>
       <title>{title ?? trace.artifact.title ?? "Throughline graph"}</title>
       <desc>{view.summary}</desc>
       <GraphDiagram view={view} geometry={geometry} frameIndex={frameIndex}
        selectedId={selectedId} onSelect={onSelectEntity}
        onExpand={id => setCollapsed(current => current.filter(item => item !== id))}
        visitedAt={firstSent} participants={participants} animate={motion.animate}/>
      </svg>
      <div className="canvas-hint">
       <span>Drag to pan · scroll to zoom · click a node to inspect</span>
       <div className="zoom-tools" role="toolbar" aria-label="Diagram navigation">
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(0.8)}
         disabled={effectiveCamera.zoom <= 1}><PlayerIcon name="minus" size={12}/></button>
        <span className="zoom-readout">{Math.round(effectiveCamera.zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1.25)}
         disabled={effectiveCamera.zoom >= 4}><PlayerIcon name="plus" size={12}/></button>
        <button type="button" aria-label="Fit to view" title="Fit to view" onClick={fit}>
         <PlayerIcon name="fit" size={12}/>
        </button>
       </div>
      </div>
     </div> : view.kind === "sequence"
     ? <SequenceView view={view} selectedId={selectedId} onSelect={onSelectEntity}/>
     : <StateFallback view={view} selectedId={selectedId}
       inspector={inspector} frameIndex={frameIndex} onSelect={onSelectEntity}/>}
   </div>
   {inspectionMode === "inspect" && <aside className="inspector" aria-label="Entity inspector">
    <div className="inspector-top"><span>INSPECT ENTITY</span>
     <button type="button" aria-label="Close inspector" onClick={() => setInspectionMode("explain")}>×</button>
    </div>
    {inspectSelected ? <>
     <div className="entity-heading">
      <i/><div><strong>{inspectSelected.label}</strong><code>entity:{inspectSelected.id}</code></div>
     </div>
     <dl>
      <div><dt>Presence</dt><dd><span className="known">
       {inspectPresent ? "present" : "not present"}</span></dd></div>
      <div><dt>Current value</dt><dd><code>
       {!inspectPresent ? "Absent" :
        inspectValue?.status === "known" ? cellText(inspectValue) :
        inspectValue?.status === "unknown" ? cellText(inspectValue) : "Absent"}
      </code></dd></div>
      <div><dt>Frame</dt><dd>#{frameIndex} · committed</dd></div>
     </dl>
     <div className="history-title"><span>RECORDED HISTORY</span><b>{inspectHistory.length}</b></div>
     {!inspectHistory.length && <p className="history-empty">No writes recorded yet.</p>}
     {[...inspectHistory].reverse().slice(0, 60).map(entry => <div className="history-item"
      key={entry.eventId} data-source-event-ids={entry.eventId}>
      <i/><div><strong>{entry.eventId}</strong>
       <span>Explicit write · {entry.originId} · frame #{entry.frameIndex}</span>
       <code>{JSON.stringify(entry.path)}: {entry.after.status === "known"
        ? cellText(entry.after) : entry.after.status === "unknown"
         ? cellText(entry.after) : "Absent"}</code>
      </div>
     </div>)}
     {inspectHistory.length > 60 && <p className="history-empty">
      Showing latest 60 writes; all records available in source inspection.</p>}
    </> : <p className="history-empty">No entities declared.</p>}
    <details className="evidence-note">
     <summary>CAUSAL EVIDENCE</summary>
     <p>Only explicit modeled dependencies are evidence; no additional event is inferred.</p>
     <InspectPanel trace={trace} inspector={inspector} frameIndex={frameIndex}
      selectedEntityId={selectedId} onSelectEntity={setSelectedId}
      onSeek={to => dispatch({ type: "step", to })}/>
     {view.kind === "sequence" && <SequenceEvidence view={view} selectedId={selectedId}
       onSelect={onSelectEntity}/>}
    </details>
   </aside>}
  </div>
  <footer className="transport"><PlayerControls state={state} dispatch={dispatch}/></footer>
  <details id={captionId} className="step-caption">
   <summary>
    <span className="step-number">{String(frameIndex + 1).padStart(2, "0")}</span>
    <span className="caption-text">
     <strong>{step?.label ?? "Initial state"}</strong>
     <span className="teaser">{step?.note ?? view.summary}</span>
    </span>
    <span className={"event-chip " + (hasWrite ? "write" : "")}>{eventType}</span>
    <span className="caption-expand"><span>Details</span><PlayerIcon name="chevron" size={14}/></span>
   </summary>
   <div className="caption-body">
    <p className="caption-note">{step?.note ?? view.summary}</p>
    {step && step.events.length > 0 && <ul className="transfers" aria-label="Declared step evidence">
     {step.events.slice(0, 80).map(event => <li key={event.id}
      data-source-event-ids={event.id}>
      {event.type === "message" ? event.phase : event.type} <b>→</b>
      <code>{event.id}</code>
     </li>)}
     {step.events.length > 80 && <li>{step.events.length - 80} more events; inspect source for details.</li>}
    </ul>}
    <details className="state-snapshot">
     <summary>Inspect state</summary>
     <dl>{trace.artifact.entities.map(entity => {
      const present = presentEntities.has(entity.id);
      const value = present ? inspector.valueAt(frameIndex, entity.id) : null;
      return <div key={entity.id} data-source-entity-ids={entity.id}>
       <dt>{entity.label} <span>({entity.id})</span></dt>
       <dd><code>{!present ? "Absent" : value?.status === "known" ? cellText(value)
        : value?.status === "unknown" ? cellText(value) : "Absent"}</code></dd>
      </div>;
     })}</dl>
    </details>
   </div>
  </details>
 </div>;
}
