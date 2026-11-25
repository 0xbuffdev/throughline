import { cn } from "cn";
import type * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
	cameraViewBox, constrainCamera, fitCamera, initialCamera, fitScale, focusCamera, panCamera, zoomCamera,
} from "../v2/graph-viewport.js";
import type { Camera } from "../layout/viewport.js";
import { BASE_STEP_MS, stepDelayMs } from "../seek.js";
import { layoutGraph, layoutGraphView } from "../v2/graph-layout.js";
import { inspectTrace } from "../v2/inspector.js";
import type {
	Cell, CompiledTrace, Id, ViewDescriptor, ViewItem, ViewKind,
} from "../v2/model.js";
import { projectView } from "../v2/views.js";
import { PlayerControls, PlayerOptions } from "./player-chrome.js";
import { useNarration } from "./use-narration.js";
import { usePlayer, useSceneWidth } from "./use-player.js";
import { SequenceView } from "./sequence-view.js";
import { sequenceActors } from "../v2/sequence-layout.js";
import { StateView } from "./state-view.js";
import { SequenceEvidence } from "./sequence-evidence.js";
import { InspectPanel, type InspectionTarget } from "./inspect-panel.js";
import { PlayerIcon } from "./player-icons.js";
import { nodeValueLines, summarizeCell } from "./value-display.js";

export type ThroughlineGraphPlayerProps = {
	/** Only a compiler-owned, immutable schema-2 trace is accepted. */
	trace: CompiledTrace;
	title?: string;
	theme?: "auto" | "light" | "dark";
	className?: string;
	/** Optional explicit override. If omitted, accepted artifact hint/auto
	 * selection determines the initial view consistently across all frames.
	 * Selecting another view tab is a deliberate manual override. */
	initialView?: ViewKind;
	/** Native speech is opt-in and remains outside the pure core. */
	narration?: boolean;
};

export type DiagramRendererProps = {
	trace: CompiledTrace;
	view: ViewDescriptor;
	frameIndex: number;
	width: number;
	selectedId: Id | null;
	groupId: Id | null;
	captionId: string;
	firstSent: ReadonlyMap<Id, number>;
	motion: { revision: number; durationMs: number; forward: boolean };
	onSelectItem: (itemId: Id) => void;
	onSelectEntity: (id: Id) => void;
	onOpenEvidence: () => void;
	fallback: () => React.ReactNode;
};

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
	view, geometry, frameIndex, selectedId, onSelect, onInspect, onExpand, visitedAt, participants, animate,
}: {
	view: ViewDescriptor;
	geometry: ReturnType<typeof layoutGraphView>;
	frameIndex: number;
	selectedId: Id | null;
	onSelect: (id: Id) => void;
	onInspect: (id: Id) => void;
	onExpand: (id: Id) => void;
	visitedAt: ReadonlyMap<Id, number>;
	participants: ReadonlySet<Id>;
	animate: boolean;
}): React.JSX.Element {
	const diagramId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
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
					<g key={item.id} className={cn("thl-link", {
						"thl-visited": visited,
						"thl-transferred": sent > 0,
						"thl-animate": animate && sent > 0,
						"thl-aggregate-active": aggregated && sent > 0,
						"thl-aggregate-visited": aggregated && visited,
					})} role="button" tabIndex={0} aria-label={"Inspect relation " + item.label}
						onPointerDown={event => event.stopPropagation()}
						onClick={() => onInspect(item.id)}
						onKeyDown={event => {
							if (event.key !== "Enter" && event.key !== " ") return;
							event.preventDefault();
							event.stopPropagation();
							onInspect(item.id);
						}} data-source-relation-ids={relationIds.join(" ")}
						data-source-event-ids={item.source.eventIds?.join(" ") ?? ""}
						data-sent-current={String(sent)}
						data-visited={String(visited)}>
						<title>{item.description}</title>
						<desc>{item.description}</desc>
						<path className="thl-edge-hit" d={line.d} fill="none" stroke="transparent"
							strokeWidth={14} pointerEvents="stroke" />
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
				const count = Number(data(item, "count"));
				const countLabel = count + (count === 1 ? " present entity" : " present entities");
				return (
					<g key={"summary-" + item.id} role="button" tabIndex={0}
						data-group-summary={group}
						data-source-group-ids={item.source.groupIds?.join(" ")}
						data-source-entity-ids={item.source.entityIds?.join(" ") ?? ""}
						data-source-relation-ids={item.source.relationIds?.join(" ") ?? ""}
						data-source-event-ids={item.source.eventIds?.join(" ") ?? ""}
						aria-label={"Expand group " + item.label + " — " + countLabel}
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
							{countLabel}
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
						<defs><clipPath id={diagramId + "-" + item.id}>
                            <rect x={8} y={6} width={rect.w - 16} height={rect.h - 12}/>
                        </clipPath></defs>
                        <g clipPath={"url(#" + diagramId + "-" + item.id + ")"}>
                        <text className="thl-node-label" x={8} y={19}>
							{preview(item.label, Math.floor((rect.w - 16) / 6.6))}
						</text>
						<text className={cn("thl-v2-value", { "thl-changed": changed })}
							x={8} y={36}>
                            {nodeValueLines(value).map((line, index) => <tspan key={index} x={8} dy={index ? 12 : 0}>
                             {preview(line, Math.floor((rect.w - 16) / 6.5))}
                            </tspan>)}
						</text>
						{changed && <path className="thl-write-marker" d={"M" + (rect.w - 10) + " 6h4m-4 3h4"} aria-hidden="true"/>}
                        </g>
					</g>
				);
			})}
			{!entityItems.length && !groups.some(item => data(item, "collapsed") === true)
				&& <text className="thl-empty" textAnchor="middle"
					x={geometry.width / 2} y={50}>No present entities at this frame.</text>}
		</>
	);
}

/**
 * Native schema-2 React player. Reuses tested transport, speech ownership,
 * viewport mathematics, edge routing and CSS; never converts v2 semantic data
 * into v1 Program/Trace or accepts a compatibility adapter.
 *
 * Graph, sequence and state-table share the SAME indexed inspector, source
 * IDs and playback frame, including the native Explain/Inspect interface.
 */
export function ThroughlineGraphPlayer(props: ThroughlineGraphPlayerProps): React.JSX.Element {
	return <GraphPlayer {...props} DiagramRenderer={undefined}/>;
}

/** Internal entry shared with the development preview. */
export function GraphPlayer({
	trace, title, className, theme = "auto", narration = false, initialView,
	DiagramRenderer,
}: ThroughlineGraphPlayerProps & {
	DiagramRenderer?: React.ComponentType<DiagramRendererProps>;
}): React.JSX.Element {
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
	const [sourceRevision, setSourceRevision] = useState(0);
	const [showSource, setShowSource] = useState(false);
	const [collapsed, setCollapsed] = useState<readonly Id[]>([]);
	const [viewKind, setViewKind] = useState<ViewKind | undefined>(initialView);
	const [inspection, setInspection] = useState<InspectionTarget | null>(null);
 const inspectorRef = useRef<HTMLElement>(null);
 const inspectorTriggerRef = useRef<HTMLButtonElement>(null);
 const inspectorId = useId();
 const viewPanelId = useId();
 const [drilled, setDrilled] = useState<Id | null>(null);
 const [follow, setFollow] = useState(false);
 const [soundOn, setSoundOn] = useState(false);
 const [soundAvailable, setSoundAvailable] = useState(false);
 const audioRef = useRef<AudioContext | null>(null);
	const [camera, setCamera] = useState<Camera | null>(null);
	const [fullscreen, setFullscreen] = useState(false);
	// Capability detection is client-only. SSR and the first hydration render
	// must agree before the mount effect enables fullscreen controls.
	const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
	const [fullscreenError, setFullscreenError] = useState<string | null>(null);
	if (identity !== trace) {
		setIdentity(trace);
		setSelectedId(null);
		setSourceRevision(current => current + 1);
		setShowSource(false);
		setCollapsed([]);
		setCamera(null);
		setViewKind(initialView);
		setInspection(null);
  setDrilled(null);
  setFollow(false);
  setSoundOn(false);
  setNarrating(false);
	}
 useEffect(() => {
  if (!inspection) return;
  inspectorRef.current?.querySelector<HTMLButtonElement>('[aria-label="Close inspector"]')?.focus();
 }, [inspection, sourceRevision]);
	useEffect(() => {
		if (!narration) setNarrating(false);
	}, [narration]);
	const [motion, setMotion] = useState({
		trace, step: state.step, animate: false, revision: 0, seekRevision, viewKind,
		speed: state.speed, playing: state.playing,
	});
	if (motion.trace !== trace || motion.step !== state.step || motion.viewKind !== viewKind ||
		motion.seekRevision !== seekRevision || motion.speed !== state.speed || motion.playing !== state.playing) {
		setMotion({
			trace, step: state.step, revision: motion.revision + 1, seekRevision, viewKind,
			speed: state.speed, playing: state.playing,
			animate: motion.trace === trace && motion.viewKind === viewKind && motion.speed === state.speed &&
				state.step === motion.step + 1 &&
				(lastAction?.type === "tick" ||
					(lastAction?.type === "step" && lastAction.animate === true)),
		});
	}
	// One motion permission for every renderer. A pause, speed change, view switch
	// or explicit same-frame seek invalidates the previous animation revision.
	const animate = motion.animate && motion.seekRevision === seekRevision &&
		(lastAction?.type === "tick" || (lastAction?.type === "step" && lastAction.animate === true));
	// On an identity change, usePlayer schedules its reset during render.
	// Never send the former trace's higher frame index into a new, shorter
	// immutable inspector while React completes that state transition.
	const frameIndex = Math.min(state.step, trace.frames.length - 1);
 const availableViews = useMemo(() =>
  ([["Graph", "graph"], ["Sequence", "sequence"], ["State", "state-table"]] as const)
   .filter(([, kind]) => projectView(inspector, { kind, frameIndex: 0 }).kind === kind),
 [inspector]);
	// The development renderer owns its geometry. The shared shell only needs
	// a preferred canvas height when its native graph is not mounted.
	const layout = useMemo<ReturnType<typeof layoutGraph>>(() => DiagramRenderer
		? { width, height: 340, viewBox: "", nodes: {}, edges: {}, groups: [] }
		: layoutGraph(trace, width), [DiagramRenderer, trace, width]);
	const view = useMemo(() => projectView(inspector, {
		kind: viewKind, frameIndex,
		selectedEntityIds: selectedId ? [selectedId] : [],
		collapsedGroupIds: collapsed,
	}), [inspector, frameIndex, viewKind, selectedId, collapsed]);
	const geometry = useMemo(() => DiagramRenderer ? layout : layoutGraphView(layout, view),
		[DiagramRenderer, layout, view]);
 const actors = useMemo(() => DiagramRenderer ? [] : sequenceActors(trace), [DiagramRenderer, trace]);
	// Only authored focusEntityIds can drive automatic camera following.
 const focusBounds = useMemo(() => {
  if (DiagramRenderer || !frameIndex) return null;
  // Authored repetitions remain in the artifact, but camera work is bounded by
  // distinct declared entities and visible geometry. Never spread authored arrays.
  const remaining = new Set(trace.artifact.steps[frameIndex - 1].focusEntityIds ?? []);
  if (!remaining.size) return null;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const item of view.items) {
   if (item.role !== "entity" && !(item.role === "group" && data(item, "collapsed") === true)) continue;
   const rect = geometry.nodes[item.id];
   if (!rect) continue;
   let matched = false;
   for (const id of item.source.entityIds ?? []) if (remaining.delete(id)) matched = true;
   if (!matched) continue;
   left = Math.min(left, rect.x);
   right = Math.max(right, rect.x + rect.w);
   top = Math.min(top, rect.y);
   bottom = Math.max(bottom, rect.y + rect.h);
   if (!remaining.size) break;
  }
  return Number.isFinite(left) ? { x: left, y: top, w: right - left, h: bottom - top } : null;
 }, [DiagramRenderer, trace, frameIndex, view, geometry]);
 const [sceneHeight, setSceneHeight] = useState<number | null>(null);
 useEffect(() => {
  const svg = svgRef.current;
  if (!svg || view.kind !== "graph") return;
  const observer = new ResizeObserver(([entry]) => {
   if (entry.contentRect.height > 0) setSceneHeight(entry.contentRect.height);
  });
  observer.observe(svg);
  return () => observer.disconnect();
 }, [view.kind]);
 const viewport = { width: layout.width, height: sceneHeight ?? Math.min(520, Math.max(240, layout.height)) };
 const overview = camera ?? initialCamera(layout, viewport);
  // Following centers the authored focus at the user's existing scale,
 // zooming out only when a multi-entity focus needs room. It never magnifies.
 const followedCamera = focusBounds ? focusCamera(layout, viewport, overview, focusBounds) : null;
 const effectiveCamera = constrainCamera(layout, viewport,
  follow && followedCamera ? followedCamera : overview);
	const presentEntities = new Set(inspector.stateAt(frameIndex).presentEntityIds);
	const step = frameIndex ? trace.artifact.steps[frameIndex - 1] : undefined;
	const stepNumber = "Step " + (frameIndex + 1) + " of " + trace.frames.length;
	const stepLabel = step?.label ?? "Initial state";
	const eventCount = step?.events.length ?? 0;
	const captionNote = step?.note ?? (step
		? eventCount + (eventCount === 1 ? " modeled event in this step." : " modeled events in this step.")
		: "Initial values and relationships.");
	const summary = stepNumber + ": " + stepLabel + ". " + view.summary;
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
	const manual = (next: Camera) => { setFollow(false); setCamera(constrainCamera(layout, viewport, next)); };
	const fit = () => manual(fitCamera(layout, viewport));
	const zoom = (factor: number) => manual(zoomCamera(layout, viewport, effectiveCamera, factor));
	const pan = (dx: number, dy: number) => manual(panCamera(layout, viewport, effectiveCamera, dx, dy));
	const dragging = useRef<{ x: number; y: number; pointerId: number } | null>(null);
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg || view.kind !== "graph") return;
		const wheel = (event: WheelEvent) => {
			if (event.ctrlKey || event.metaKey || !event.deltaY) return;
			const factor = Math.exp(-Math.max(-180, Math.min(180, event.deltaY)) / 300);
			const matrix = svg.getScreenCTM();
			const anchor = matrix
				? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
				: undefined;
			const next = zoomCamera(layout, viewport, effectiveCamera, factor, anchor);
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
  return () => {
   const audio = audioRef.current;
   audioRef.current = null;
   if (audio) void audio.close().catch(() => {});
  };
 }, []);
 const toggleSound = () => {
  if (soundOn) { setSoundOn(false); return; }
  const Ctx = window.AudioContext;
  if (!Ctx) return;
  try {
   audioRef.current ??= new Ctx();
   void audioRef.current.resume().catch(() => {});
   setSoundOn(true);
  } catch { /* Hardware or permissions must not interrupt the timeline. */ }
 };
 useEffect(() => {
  if (!soundOn || !audioRef.current) return;
  const audio = audioRef.current;
  let oscillator: OscillatorNode | undefined;
  let gain: GainNode | undefined;
  let released = false;
  const release = () => {
   if (released) return;
   released = true;
   if (oscillator) oscillator.onended = null;
   try { oscillator?.disconnect(); } catch { /* optional audio */ }
   try { gain?.disconnect(); } catch { /* optional audio */ }
  };
  const stop = () => {
   if (released) return;
   try { oscillator?.stop(); } catch { /* already ended or not started */ }
   release();
  };
  try {
   oscillator = audio.createOscillator();
   gain = audio.createGain();
   const now = audio.currentTime;
   oscillator.frequency.value = 220 * Math.pow(2, frameIndex / Math.max(1, state.max) * 1.5);
   gain.gain.setValueAtTime(0.0001, now);
   gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
   gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
   oscillator.connect(gain);
   gain.connect(audio.destination);
   oscillator.onended = release;
   oscillator.start();
   oscillator.stop(now + 0.32);
   return stop;
  } catch { stop(); /* audio is optional, including partial node creation */ }
 }, [trace, frameIndex, seekRevision, soundOn, state.max]);

 const entityFieldId = useId();
 const groupFieldId = useId();
 const helpId = useId();
 const captionId = useId();
 const origins = [...new Set(trace.artifact.origins.map(origin => origin.kind))].join(" + ");
 const openInspection = (target: InspectionTarget, source = false) => {
  setSelectedId(target.kind === "entity" ? target.entityId : null);
  setInspection(target);
  setShowSource(source);
  setSourceRevision(current => current + 1);
 };
 const onSelectEntity = (entityId: Id) => openInspection({ kind: "entity", entityId });
 const onOpenEvidence = () => openInspection({ kind: "step" }, true);
 const onInspectStateEvent = (eventId: Id) => openInspection({ kind: "event", eventId }, true);
 const closeInspection = () => {
  setInspection(null);
  inspectorTriggerRef.current?.focus();
 };
 const toggleInspection = () => inspection ? closeInspection() : openInspection({ kind: "step" });
 const onSelectItem = (id: Id) => {
  const item = view.items.find(candidate => candidate.id === id);
  if (!item) return;
  if (item.role === "entity" && item.source.entityIds?.[0]) {
   onSelectEntity(item.source.entityIds[0]);
   return;
  }
  if (item.role === "group" && data(item, "collapsed") === true) {
   setCollapsed(current => current.filter(group => group !== item.source.groupIds?.[0]));
   return;
  }
  const eventId = item.role === "event" ? item.source.eventIds?.[0] : undefined;
  if (item.source.relationIds?.length && (item.role === "relation" || data(item, "type") === "message"))
   openInspection({
   kind: "transfer", relationIds: item.source.relationIds, eventId,
  });
  else if (eventId) openInspection({ kind: "event", eventId });
 };
 // Selecting authored elements must never rewrite or reframe their graph
 // geometry. Zoom/pan/follow are only explicit camera controls.
 const focusEntity = (id: Id) => onSelectEntity(id);
 const focusGroup = (id: Id | null) => {
  setDrilled(id);
  if (DiagramRenderer) return;
  if (!id) { fit(); return; }
  const item = view.items.find(candidate => candidate.role === "group" &&
   candidate.source.groupIds?.includes(id));
  const rect = item && (geometry.groups.find(group => group.id === item.id) ?? geometry.nodes[item.id]);
  if (rect) manual({ centerX: rect.x + rect.w / 2, centerY: rect.y + rect.h / 2,
   zoom: Math.min(2.4, 0.8 * Math.min(viewport.width / rect.w, viewport.height / rect.h)) });
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
  {view.kind === "graph" && Boolean(trace.artifact.groups?.length) && <nav className="group-nav" aria-label="Group hierarchy">
   <button type="button" className="opt-icon" aria-label="Return to group overview"
    onClick={() => focusGroup(null)}><PlayerIcon name="home" size={14}/></button>
   {drilled && <span className="crumb">/ {trace.artifact.groups?.find(group => group.id === drilled)?.label}</span>}
   <span className="opt-select grow">
    <select id={groupFieldId} aria-label="Focus group" value={drilled ?? ""}
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
  </nav>}
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
  style={{ "--thl-step-ms": stepDelayMs(BASE_STEP_MS, state.speed) + "ms",
   "--thl-canvas-height": Math.min(520, Math.max(240, layout.height)) + 80 + "px",
  } as React.CSSProperties}>
  <p id={helpId} className="thl-sr-only">Focus this player to seek with Left and Right arrows, Home and End,
   and play or pause with Space. Focus the graph to pan with arrows, zoom with plus or minus, or fit with zero.</p>
  <p className="thl-sr-only" role="status" aria-atomic="true">{summary}</p>
  {voice.error && narration && <p role="alert" className="narration-error">{voice.error}</p>}
  {fullscreenError && <p role="alert" className="narration-error">{fullscreenError}</p>}
  <header className="player-header">
   <div className="title-block">
    {(title ?? trace.artifact.title)?.trim() && <h2>{title ?? trace.artifact.title}</h2>}
   </div>
   <div className="header-actions">
    <button ref={inspectorTriggerRef} type="button" aria-controls={inspectorId}
     aria-expanded={!!inspection} className={inspection ? "active" : ""}
     aria-label="Inspect" aria-pressed={!!inspection} onClick={toggleInspection}><PlayerIcon name="inspect"/><span>Inspect</span></button>
    <PlayerOptions trace={trace} state={state} dispatch={dispatch}
     diagramControls={diagramControls}
     inspection={{ enabled: !!inspection, toggle: toggleInspection }}
     sound={{ enabled: soundOn, available: soundAvailable, toggle: toggleSound }}
     narration={narration ? { enabled: narrating, available: voice.available, toggle: voice.toggle } : undefined}
     fullscreen={{ active: fullscreen, available: fullscreenAvailable, toggle: toggleFullscreen }}/>
   </div>
  </header>
  <div className="context-bar">
   <div className="view-tabs" role="tablist" aria-label="Visualization view">
    {availableViews.map(([label, kind], index) => <button type="button" key={kind}
      role="tab" id={viewPanelId + "-" + kind} aria-controls={viewPanelId} aria-selected={view.kind === kind}
      tabIndex={view.kind === kind ? 0 : -1}
      className={view.kind === kind ? "active" : ""}
      onKeyDown={event => {
       const next = event.key === "Home" ? 0 : event.key === "End" ? availableViews.length - 1
        : event.key === "ArrowRight" ? (index + 1) % availableViews.length
        : event.key === "ArrowLeft" ? (index + availableViews.length - 1) % availableViews.length : -1;
       if (next < 0) return;
       event.preventDefault();
       event.stopPropagation();
       setViewKind(availableViews[next][1]);
       setMotion(current => ({ ...current, animate: false }));
       event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }}
      onClick={() => { setViewKind(kind); setMotion(current => ({ ...current, animate: false })); }}>{label}</button>)}
   </div>
   <div className="truth-note"><span>Source</span> {origins}</div>
  </div>
  <div className={"player-content " + (inspection ? "with-inspector" : "")}>
   <div className="canvas" ref={canvasRef} id={viewPanelId}
    role="tabpanel" aria-labelledby={viewPanelId + "-" + view.kind}>
    <div className="canvas-meta">
     <span className="step-number">{stepNumber}</span>
     <strong title={stepLabel}>{stepLabel}</strong>
    </div>
    {DiagramRenderer && view.kind !== "state-table" ?
     <DiagramRenderer trace={trace} view={view} frameIndex={frameIndex} width={width} firstSent={firstSent}
      selectedId={selectedId} groupId={drilled} captionId={captionId}
      motion={{
       revision: motion.revision, durationMs: Math.min(700, stepDelayMs(700, state.speed)),
       forward: animate,
      }}
      onSelectItem={onSelectItem} onSelectEntity={onSelectEntity} onOpenEvidence={onOpenEvidence}
      fallback={() => <StateView view={projectView(inspector, { kind: "state-table", frameIndex })}
       selectedId={selectedId} inspector={inspector} frameIndex={frameIndex} onSelect={onSelectEntity} onInspectEvent={onInspectStateEvent}/>}/>
    : view.kind === "graph" ?
     <div className="graph-wrap">
      <svg ref={svgRef} className="graph thl-scene thl-v2-diagram" role="img" tabIndex={0}
       viewBox={cameraViewBox(layout, viewport, effectiveCamera)}
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
        const matrix = event.currentTarget.getScreenCTM();
        const worldX = matrix ? 1 / matrix.a : layout.width / effectiveCamera.zoom / Math.max(bounds.width, 1);
        const worldY = matrix ? 1 / matrix.d : layout.height / effectiveCamera.zoom / Math.max(bounds.height, 1);
        pan((event.clientX - start.x) * worldX, (event.clientY - start.y) * worldY);
        dragging.current = { ...start, x: event.clientX, y: event.clientY };
       }}
       onPointerUp={() => { dragging.current = null; }}
       onPointerCancel={() => { dragging.current = null; }}>
       <title>{title ?? trace.artifact.title ?? "Throughline graph"}</title>
       <desc>{view.summary}</desc>
       <GraphDiagram view={view} geometry={geometry} frameIndex={frameIndex}
        selectedId={selectedId} onSelect={onSelectEntity} onInspect={onSelectItem}
        onExpand={id => setCollapsed(current => current.filter(item => item !== id))}
        visitedAt={firstSent} participants={participants} animate={animate}/>
      </svg>
      <div className="canvas-hint">
       <span>Drag to pan · scroll to zoom · select a node or arrow to inspect</span>
       <div className="zoom-tools" role="toolbar" aria-label="Diagram navigation">
        <button type="button" aria-label="Follow active" title="Follow authored focus"
         aria-pressed={follow} onClick={() => {
          setCamera(effectiveCamera); setFollow(current => !current);
         }}><PlayerIcon name="focus" size={12}/></button>
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(0.8)}
         disabled={effectiveCamera.zoom <= fitScale(layout, viewport)}><PlayerIcon name="minus" size={12}/></button>
        <span className="zoom-readout">{Math.round(effectiveCamera.zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1.25)}
         disabled={effectiveCamera.zoom >= 4}><PlayerIcon name="plus" size={12}/></button>
        <button type="button" aria-label="Fit to view" title="Fit to view" onClick={fit}>
         <PlayerIcon name="fit" size={12}/>
        </button>
       </div>
      </div>
     </div> : view.kind === "sequence"
     ? <SequenceView view={view} actors={actors} present={presentEntities} selectedId={selectedId}
       onSelect={onSelectEntity} onInspect={onSelectItem}
       animate={animate}/>
     : <StateView view={view} selectedId={selectedId}
       inspector={inspector} frameIndex={frameIndex} onSelect={onSelectEntity} onInspectEvent={onInspectStateEvent}/>}
   </div>
   {inspection && <aside ref={inspectorRef} id={inspectorId} className="inspector"
    aria-label="Workflow inspector"
    onKeyDown={event => {
     if (event.key !== "Escape") return;
     event.preventDefault(); event.stopPropagation();
     closeInspection();
    }}>
    <div className="inspector-top">
     <div>
      <span className="step-number">{stepNumber}</span>
      <strong title={stepLabel}>{stepLabel}</strong>
     </div>
     <button type="button" aria-label="Close inspector" onClick={closeInspection}>×</button>
    </div>
    <InspectPanel key={sourceRevision} trace={trace} inspector={inspector} frameIndex={frameIndex}
     target={inspection} showSource={showSource} onSelect={openInspection}
     onSeek={to => dispatch({ type: "step", to })}>
     {view.kind === "sequence" && <SequenceEvidence view={view} selectedId={selectedId}
       onSelect={onSelectEntity} onInspect={onSelectItem}/>}
    </InspectPanel>
   </aside>}
  </div>
  <footer className="transport"><PlayerControls state={state} dispatch={dispatch}/></footer>
  <details id={captionId} className="step-caption">
   <summary>
    <span className="caption-text">
     <strong>Step notes</strong>
     <span className="teaser">{captionNote}</span>
    </span>
    <span className="caption-expand"><span>Details</span><PlayerIcon name="chevron" size={14}/></span>
   </summary>
   <div className="caption-body">
    <p className="caption-note">{captionNote}</p>
    <button type="button" className="mermaid-evidence" onClick={() => openInspection({ kind: "step" })}>
     Inspect this step
    </button>
   </div>
  </details>
 </div>;
}
