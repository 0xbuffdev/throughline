import type * as React from "react";
import { useId, useMemo, useRef, useState } from "react";
import { projectInspection, type InspectionClaim, type InspectionEvidence, type InspectionView } from "../v2/inspection.js";
import type {
	CompiledTrace, Id, Path, ReadonlySemanticEvent, StateChange, TraceInspector,
} from "../v2/model.js";
import { summarizeCell } from "../v2/value-summary.js";
import { encodeJson } from "../v2/validator.js";
import { CellValue, ExactJson, ValueTree } from "./value-display.js";

export type InspectionTarget =
	| { kind: "step" }
	| { kind: "entity"; entityId: Id }
	| { kind: "transfer"; relationIds: readonly Id[]; eventId?: Id }
	| { kind: "event"; eventId: Id };

const PHASES = ["sent", "received", "processed", "acknowledged"] as const;
type Message = Extract<ReadonlySemanticEvent, { type: "message" }>;

function isMessage(event: ReadonlySemanticEvent): event is Message {
	return event.type === "message";
}

export function InspectPanel({ trace, inspector, frameIndex, target, showSource, onSelect, onSeek, children }: {
	trace: CompiledTrace;
	inspector: TraceInspector;
	frameIndex: number;
	target: InspectionTarget;
	showSource: boolean;
	onSelect: (target: InspectionTarget) => void;
	onSeek: (frameIndex: number) => void;
	children?: React.ReactNode;
}): React.JSX.Element {
	const [sourceOpen, setSourceOpen] = useState(showSource);
	const { artifact } = trace;
	const step = artifact.steps[frameIndex - 1];
	const entity = target.kind === "entity" ? artifact.entities.find(item => item.id === target.entityId) : undefined;
	const entityLabel = (id: Id) => artifact.entities.find(item => item.id === id)?.label ?? id;
	const relationLabel = (id: Id) => artifact.relations.find(item => item.id === id)?.label ?? id;
	const selectedEventId = "eventId" in target ? target.eventId : undefined;
	const relationIds = target.kind === "transfer" ? target.relationIds : [];
	const relation = relationIds.length === 1 ? artifact.relations.find(item => item.id === relationIds[0]) : undefined;
	const currentMessages = step?.events.filter(isMessage).filter(event => relationIds.includes(event.relationId)) ?? [];
	const messageIds = new Set(currentMessages.map(event => event.messageId));
	const messageEvents = useMemo(() => target.kind === "transfer" ? artifact.steps.slice(0, frameIndex)
		.flatMap(chapter => chapter.events.filter(isMessage).filter(event => target.relationIds.includes(event.relationId)))
		: [], [artifact, frameIndex, target]);
	const message = selectedEventId ? messageEvents.find(event => event.id === selectedEventId)
		: messageIds.size === 1 ? currentMessages[0] : undefined;
	const phases = new Set(messageEvents.filter(event => (!message || event.messageId === message.messageId))
		.map(event => event.phase));
	const selectedEvent = target.kind === "event" && artifact.steps.slice(0, frameIndex)
		.some(chapter => chapter.events.some(event => event.id === target.eventId))
		? inspector.eventById(target.eventId) : undefined;
	const changes = inspector.diff(Math.max(0, frameIndex - 1), frameIndex);
	const changed = new Map(changes.map(change => [change.eventId, change]));
	const visibleEvents = step?.events.slice(0, 8) ?? [];
	const present = entity && trace.frames[frameIndex].snapshot.presentEntityIds.includes(entity.id);
	const value = entity ? inspector.valueAt(frameIndex, entity.id) : undefined;
	const collection = value?.status === "known" && value.value !== null && typeof value.value === "object"
		? value.value : undefined;
	const fields = collection && !Array.isArray(collection) ? Object.values(collection) : [];
	const inlineFields = fields.length > 0 && fields.length <= 3 &&
		fields.every(field => field === null || typeof field !== "object");
	const latest = entity ? inspector.history(entity.id).filter(entry => entry.frameIndex <= frameIndex).at(-1) : undefined;
	const beforeUpdate = latest && summarizeCell(latest.before);
	const afterUpdate = latest && summarizeCell(latest.after);
	const [queryEntity, setQueryEntity] = useState<Id | null>(entity?.id ?? null);

	function eventText(event: ReadonlySemanticEvent): string {
		if (event.type === "message") {
			const route = artifact.relations.find(item => item.id === event.relationId)!;
			const phase = event.phase[0].toUpperCase() + event.phase.slice(1);
			return phase + " · " + entityLabel(route.from) + " → " + entityLabel(route.to);
		}
		if (event.type === "observation") return "Observation · " + entityLabel(event.entityId);
		if (event.type === "write") {
			const change = changed.get(event.id);
			const name = entityLabel(event.entityId) + (event.path.length ? " · " + event.path.join(" › ") : "");
			if (change?.kind !== "write") return "Set " + name;
			const before = summarizeCell(change.before);
			const after = summarizeCell(change.after);
			return before === after ? "Set " + name + " · " + after : name + " · " + before + " → " + after;
		}
		const name = event.target === "entity" ? entityLabel(event.targetId) : relationLabel(event.targetId);
		const change = changed.get(event.id);
		const assertion = name + (event.present ? " · presence asserted present" : " · presence asserted absent");
		if (change?.kind !== "presence") return assertion;
		return change.before === change.after ? assertion + " (unchanged)"
			: name + (change.after ? " became present" : " became absent");
	}

	return <>
		<div className="inspect-summary" data-source-relation-ids={relationIds.join(" ") || undefined}
			data-source-event-ids={message?.id ?? selectedEvent?.id} data-source-entity-ids={entity?.id}>
			{target.kind === "step" && <>
				<h3>This step</h3>
				{visibleEvents.length ? <ul aria-label="Events in this step">{visibleEvents.map(event =>
					<li key={event.id} data-source-event-ids={event.id}>
						{isMessage(event) ? <button type="button" onClick={() => onSelect({
							kind: "transfer", relationIds: [event.relationId], eventId: event.id,
						})}>{eventText(event)}</button> : eventText(event)}
					</li>)}</ul> : <p>{step ? "No events in this step." : "The workflow starts with its initial values."}</p>}
				{step && step.events.length > visibleEvents.length && <p>{step.events.length - visibleEvents.length} more events in Source details.</p>}
			</>}
			{entity && <>
				<h3>{entity.label}</h3>
				<dl>
					<div><dt>Presence</dt><dd>{present ? "Present" : "Not present"}</dd></div>
					<div className="current-value"><dt>{present ? "Current value" : "Retained modeled cell"}</dt><dd>
						{!present && <p>Entity not present; the modeled cell is retained independently of presence.</p>}
						{collection ? <>
							<ValueTree key={frameIndex + ":" + entity.id} value={collection} name="Browse fields" inline={inlineFields}/>
							<ExactJson value={collection} prefix="" label={"current value of " + entity.id} compact/>
						</> : value ? <CellValue cell={value} label={"current value of " + entity.id}/> : "No modeled cell"}
					</dd></div>
					<div><dt>Latest update</dt><dd>{latest ? <span data-source-event-ids={latest.eventId}>
						Step {latest.frameIndex + 1}{latest.path.length > 0 && " · " + latest.path.join(" › ")}
						{beforeUpdate !== afterUpdate && <span className="value-change">{beforeUpdate} → {afterUpdate}</span>}
					</span> : "No updates yet."}</dd></div>
				</dl>
			</>}
			{target.kind === "transfer" && <>
				<h3>{relation ? relationLabel(relation.id) : relationIds.length + " connections"}</h3>
				{relation && <p>{entityLabel(relation.from)} → {entityLabel(relation.to)}</p>}
				{selectedEventId && !message ? <p>This event is outside the current step history.</p>
					: relation ? <dl className="inspect-phases" aria-label={message ? "Phases for this message" : "Phases on this connection"}>
						{PHASES.map(phase => <div key={phase}><dt>{phase}</dt><dd>{phases.has(phase) ? "Recorded" : "Not recorded"}</dd></div>)}
					</dl> : <ul aria-label="Connections">{relationIds.slice(0, 8).map(id => <li key={id}>
						<button type="button" onClick={() => onSelect({ kind: "transfer", relationIds: [id] })}>{relationLabel(id)}</button>
					</li>)}</ul>}
				{messageIds.size > 1 && !message && <p>Source details lists individual events for this step.</p>}
			</>}
			{target.kind === "event" && <h3>{selectedEvent ? eventText(selectedEvent) : "Event outside the current step history"}</h3>}
		</div>
		<details className="evidence-note" open={sourceOpen} onToggle={event => setSourceOpen(event.currentTarget.open)}>
			<summary>Source details</summary>
			{sourceOpen && <>
				<AdvancedInspection trace={trace} inspector={inspector} frameIndex={frameIndex}
					selectedEntityId={queryEntity} onSelectEntity={setQueryEntity} onSeek={onSeek}
					initialRelationId={message?.relationId ?? relation?.id ?? relationIds[0]}
					initialEventId={selectedEventId ?? message?.id} openSequenceLog={showSource}>
					{children}
				</AdvancedInspection>
			</>}
		</details>
	</>;
}

const PAGE = 60;
const CLAIM_PAGE = 12;
const CITATIONS_PER_CLAIM = 12;

function RecordedEvidence({ evidence }: {
	evidence: InspectionEvidence;
}): React.JSX.Element | null {
	const recorded = evidence.recorded;
	if (!recorded) return null;
	return <section className="thl-v2-inspect-recorded" role="region"
		aria-label={"Recorded source data for event " + evidence.eventId}
		data-source-event-ids={evidence.eventId}
		data-source-entity-ids={evidence.source.entityIds?.join(" ") ?? ""}
		data-source-relation-ids={evidence.source.relationIds?.join(" ") ?? ""}>
		{recorded.kind === "observation" ? <>
			<p>Recorded observation for event <code>{evidence.eventId}</code>.
				This source value is an observation only; it does not write or
				commit the entity's modeled state.</p>
			<CellValue cell={recorded.value}
				label={"observation value for event " + evidence.eventId}/>
		</> : <>
			<p>Authored payload for message event <code>{evidence.eventId}</code>.
				Payload presence does not prove receipt, processing, acknowledgement
				or any destination-state mutation.</p>
			<ExactJson value={recorded.value} prefix="Payload: "
				label={"message payload for event " + evidence.eventId}/>
		</>}
	</section>;
}

/**
 * Independent fixed citation page per mounted editorial claim. A thousand
 * valid claims cannot create a hundred thousand mounted evidence controls.
 */
function ClaimCard({ claim, onInspect }: {
	claim: InspectionClaim; onInspect: (evidence: InspectionEvidence) => void;
}): React.JSX.Element {
	const [page, setPage] = useState(0);
	const total = claim.modeledEvidence.length;
	const last = Math.max(0, Math.ceil(total / CITATIONS_PER_CLAIM) - 1);
	const current = Math.min(page, last);
	const visible = claim.modeledEvidence.slice(
		current * CITATIONS_PER_CLAIM, (current + 1) * CITATIONS_PER_CLAIM);
	return <li className="thl-v2-inspect-claim"
		data-source-claim-id={claim.claim.id}
		data-source-event-ids={visible.map(e => e.eventId).join(" ")}>
		<strong>{claim.claim.text}</strong> {claim.explanation}
		{claim.unmodeledUntilLater > 0 && <p role="note">
			{claim.unmodeledUntilLater} cited event(s) are not yet
			in this frame; they cannot support the claim here.</p>}
		<p>Modeled cited events: {total}; showing {visible.length}
			{total ? " of " + total : ""} explicit source reference(s).
			References are not independent proof of the claim.</p>
		{total > 0 && <ul aria-label={"Source evidence for claim " + claim.claim.id}>
			{visible.map(e => <li key={e.eventId}>
				<button type="button" onClick={() => onInspect(e)}
					data-source-event-ids={e.eventId}>
					Inspect event {e.eventId} (step {e.frameIndex + 1})
				</button>
			</li>)}
		</ul>}
		{last > 0 && <div className="thl-v2-inspect-pager" role="group"
			aria-label={"Evidence pages for claim " + claim.claim.id}>
			<button type="button" disabled={current === 0}
				onClick={() => setPage(n => Math.max(0, n - 1))}>
				Previous cited events for {claim.claim.id}
			</button>
			<span>Page {current + 1} of {last + 1}</span>
			<button type="button" disabled={current === last}
				onClick={() => setPage(n => Math.min(last, n + 1))}>
				Next cited events for {claim.claim.id}
			</button>
		</div>}
	</li>;
}

function pathText(path: Path): string {
	return path.length ? JSON.stringify(path) : "Whole entity";
}
function frameOf(change: StateChange): number { return change.frameIndex; }
function changeText(change: StateChange): string {
	return change.kind === "write"
		? "Write to " + change.entityId + " at " + pathText(change.path)
		: "Presence " + change.target + " " + change.targetId;
}
/** The selected frame's chapter always drives all query results. */
function AdvancedInspection({
	trace, inspector, frameIndex, selectedEntityId, onSelectEntity, onSeek,
	initialRelationId = "", initialEventId = "", openSequenceLog, children,
}: {
	trace: CompiledTrace;
	inspector: TraceInspector;
	frameIndex: number;
	selectedEntityId: Id | null;
	onSelectEntity: (entityId: Id | null) => void;
	onSeek: (frameIndex: number) => void;
	initialRelationId?: Id;
	initialEventId?: Id;
	openSequenceLog: boolean;
	children?: React.ReactNode;
}): React.JSX.Element {
	const toolGroup = useId();
	const eventTool = useRef<HTMLDetailsElement>(null);
	const [compareFrom, setCompareFrom] = useState<number | null>(null);
	const [pathInput, setPathInput] = useState("");
	const [queryPath, setQueryPath] = useState<Path>([]);
	const [pathError, setPathError] = useState("");
	const [relationId, setRelationId] = useState<Id>(initialRelationId);
	const [focusEventId, setFocusEventId] = useState<Id>(initialEventId);
	const [changePage, setChangePage] = useState(0);
	const [historyPage, setHistoryPage] = useState(0);
	const [transferPage, setTransferPage] = useState(0);
	const [eventPage, setEventPage] = useState(0);
	const [claimPage, setClaimPage] = useState(0);
	const [dependencyPage, setDependencyPage] = useState(0);

	const eventFrames = useMemo(() => {
		const map = new Map<Id, number>();
		for (const [index, step] of trace.artifact.steps.entries())
			for (const event of step.events) map.set(event.id, index + 1);
		return map;
	}, [trace]);
	const effectiveFrom = Math.min(frameIndex, compareFrom ?? Math.max(0, frameIndex - 1));
	const currentEvents = frameIndex ? trace.artifact.steps[frameIndex - 1].events : [];
	const effectiveFocus = focusEventId &&
		(eventFrames.get(focusEventId) ?? Infinity) <= frameIndex
		? focusEventId : currentEvents[0]?.id;
	const relation = trace.artifact.relations.find(r => r.id === relationId);
	const result: InspectionView = useMemo(() => projectInspection(inspector, {
		frameIndex,
		compareFromIndex: effectiveFrom,
		...(selectedEntityId ? { entityId: selectedEntityId, path: queryPath } : {}),
		...(relation ? { relationId: relation.id } : {}),
		...(effectiveFocus ? { eventId: effectiveFocus } : {}),
	}), [inspector, frameIndex, effectiveFrom, selectedEntityId, queryPath, relation, effectiveFocus]);

	const inspectEvent = (evidence: InspectionEvidence): void => {
		focusEvent(evidence.eventId, evidence.frameIndex);
	};
	const focusEvent = (id: Id, frame: number): void => {
		setFocusEventId(id);
		onSeek(frame);
		const tool = eventTool.current;
		if (tool && !tool.open) {
			tool.open = true;
			tool.querySelector("summary")?.focus();
		}
	};
	const inspectChange = (change: StateChange): void => {
		if (change.kind === "write") {
			onSelectEntity(change.entityId);
			setPathInput(JSON.stringify(change.path));
			setQueryPath(change.path);
			setPathError("");
		} else if (change.target === "entity") onSelectEntity(change.targetId);
		focusEvent(change.eventId, change.frameIndex);
	};
	const commitPath = (input: string): void => {
		try {
			if (input.length > 512) throw new Error("Path input exceeds 512 characters");
			const parsed: unknown = input.trim() ? JSON.parse(input) : [];
			if (!Array.isArray(parsed))
				throw new Error('Use a JSON path array, e.g. ["state", 0]');
			if (!selectedEntityId)
				throw new Error("Select an entity before querying its path");
			// Reuse the canonical inspector's defensive typed-path validation.
			inspector.valueAt(frameIndex, selectedEntityId, parsed as Path);
			setQueryPath(Object.freeze([...parsed]) as Path);
			setPathError("");
			setHistoryPage(0);
		} catch (error) {
			setPathError(error instanceof Error ? error.message : "Invalid JSON path");
		}
	};
	const chooseEntity = (id: string): void => {
		onSelectEntity(id || null);
		setQueryPath([]);
		setPathInput("");
		setPathError("");
		setHistoryPage(0);
	};
	const currentStep = result.chapter;
	const history = result.selected?.history ?? [];
	const transfer = result.relation?.transfers ?? [];
	const changes = result.changes;
	const stepEvidence = result.stepEvidence;
	const renderPage = <T,>(values: readonly T[], page: number) => {
		const max = Math.max(0, Math.ceil(values.length / PAGE) - 1);
		const safe = Math.min(page, max);
		return { values: values.slice(safe * PAGE, (safe + 1) * PAGE), page: safe, max };
	};
	const currentChanges = renderPage(changes, changePage);
	const currentHistory = renderPage(history, historyPage);
	const currentTransfer = renderPage(transfer, transferPage);
	const currentEvidence = renderPage(stepEvidence, eventPage);
	const currentDependencies = renderPage(result.focused?.dependencies ?? [], dependencyPage);
	const claims = result.focused?.claims ?? [];
	const totalClaimPages = Math.max(1, Math.ceil(claims.length / CLAIM_PAGE));
	const activeClaimPage = Math.min(claimPage, totalClaimPages - 1);
	const currentClaims = claims.slice(activeClaimPage * CLAIM_PAGE,
		(activeClaimPage + 1) * CLAIM_PAGE);
	const pager = (label: string, page: number, max: number, onChange: (n: number) => void) =>
		max > 0 && <div className="thl-v2-inspect-pager" role="group" aria-label={label + " pages"}>
			<button type="button" disabled={page === 0} onClick={() => onChange(page - 1)}>
				Previous {label} page
			</button>
			<span>Page {page + 1} of {max + 1}</span>
			<button type="button" disabled={page === max} onClick={() => onChange(page + 1)}>
				Next {label} page
			</button>
		</div>;
	const eventButton = (e: InspectionEvidence) =>
		<button type="button" onClick={() => inspectEvent(e)}
			data-source-event-ids={e.eventId}
			data-source-entity-ids={e.source.entityIds?.join(" ") ?? ""}
			data-source-relation-ids={e.source.relationIds?.join(" ") ?? ""}>
			Inspect event {e.eventId} (step {e.frameIndex + 1})
		</button>;

	return (
		<section className="thl-v2-inspect" role="region" aria-label="Evidence inspector">
			<header className="thl-v2-inspect-header">
				<p>Frame ID <code>{currentStep.frameId}</code></p>
			</header>
			<details name={toolGroup} className="inspect-tool">
				<summary>Compare steps</summary>
				<section aria-label="What changed?" className="thl-v2-inspect-section">
					{currentStep.time && <p>
						{currentStep.time.kind === "logical"
							? "Declared logical tick " + currentStep.time.tick
							: "Declared wall-clock timestamp " + currentStep.time.iso8601}.
						This metadata does not establish elapsed duration or cause.
					</p>}
					<p>Only explicit writes and presence changes are listed. Same-value
						writes remain visible; message and observation events do not create writes.</p>
					<label>Compare from step
						<input type="number" min={1} max={frameIndex + 1}
							value={effectiveFrom + 1}
							onChange={event => {
								const n = Number(event.currentTarget.value) - 1;
								if (Number.isSafeInteger(n) && n >= 0 && n <= frameIndex) {
									setCompareFrom(n);
									setChangePage(0);
								}
							}}/>
					</label>
					<p>Changes after <code>{result.fromFrameId}</code> through <code>{currentStep.frameId}</code>:
						{" "}{changes.length} explicit mutation(s).</p>
					{changes.length ? <>
						<div className="thl-v2-inspect-table-wrap" role="region" aria-label="Authored changes: scroll table horizontally" tabIndex={0}><table><caption>Authored changes, in frame/event order</caption>
							<thead><tr><th scope="col">Source event</th><th scope="col">Target</th>
								<th scope="col">Before</th><th scope="col">After</th></tr></thead>
							<tbody>{currentChanges.values.map(change =>
								<tr key={change.eventId} data-source-event-ids={change.eventId}
									data-frame-index={frameOf(change)}>
									<th scope="row"><button type="button" onClick={() => inspectChange(change)}>
										{change.eventId} (step {change.frameIndex + 1})
									</button></th>
									<td>{changeText(change)}{change.kind === "write" &&
										encodeJson(change.before) === encodeJson(change.after)
										? " — explicit same-value write" : ""}</td>
									<td>{change.kind === "write"
										? <CellValue cell={change.before} label={"before event " + change.eventId}/>
										: change.before ? "Present" : "Not present"}</td>
									<td>{change.kind === "write"
										? <CellValue cell={change.after} label={"after event " + change.eventId}/>
										: change.after ? "Present" : "Not present"}</td>
								</tr>)}</tbody>
						</table></div>
						{pager("Changes", currentChanges.page, currentChanges.max, setChangePage)}
					</> : <p role="note">No explicit write or presence change in this interval.
						This does not mean no messages or observations occurred.</p>}
				</section>
			</details>
			<details name={toolGroup} className="inspect-tool">
				<summary>Values and write history</summary>
				<section aria-label="What do we know?" className="thl-v2-inspect-section">
					<label>Source entity
						<select aria-label="Inspect entity" value={selectedEntityId ?? ""}
							onChange={event => chooseEntity(event.currentTarget.value)}>
							<option value="">Choose entity</option>
							{result.state.map(entity => <option key={entity.entityId}
								value={entity.entityId}>{entity.label}</option>)}
						</select>
					</label>
					{result.selected ? <>
						<form onSubmit={event => { event.preventDefault(); commitPath(pathInput); }}>
							<label>Path (JSON array, empty for whole entity)
								<input type="text" aria-label="Inspect path" value={pathInput}
									maxLength={512} onChange={event => setPathInput(event.currentTarget.value)}/>
							</label>
							<button type="submit">Inspect path</button>
						</form>
						{pathError && <p role="alert">{pathError}</p>}
						<p>Selected <strong>{result.selected.label}</strong>, path
							{" "}<code>{pathText(result.selected.path)}</code>.</p>
						<div className="thl-v2-inspect-table-wrap" role="region" aria-label="Previous and current state: scroll table horizontally" tabIndex={0}><table>
							<caption>Previous and current modeled state at requested path</caption>
							<thead><tr><th scope="col">Comparison</th>
								<th scope="col">Modeled presence</th><th scope="col">Value</th></tr></thead>
							<tbody><tr><th scope="row">Step {effectiveFrom + 1}</th>
								<td>{result.selected.presentBefore ? "Present" : "Not present"}</td>
								<td><CellValue cell={result.selected.before}
									label={"selected at comparison step " + (effectiveFrom + 1)}/></td></tr>
							<tr><th scope="row">Current step {frameIndex + 1}</th>
								<td>{result.selected.presentAfter ? "Present" : "Not present"}</td>
								<td><CellValue cell={result.selected.after}
									label={"selected at current step " + (frameIndex + 1)}/></td></tr></tbody>
						</table></div>
						<h5>Written-path history ({history.length})</h5>
						{history.length ? <>
							<div className="thl-v2-inspect-table-wrap" role="region" aria-label="Written-path history: scroll table horizontally" tabIndex={0}><table><caption>Only explicit overlapping writes through this frame</caption>
								<thead><tr><th scope="col">Written source</th><th scope="col">Target path</th>
									<th scope="col">Before at requested path</th>
									<th scope="col">After at requested path</th></tr></thead>
								<tbody>{currentHistory.values.map(entry =>
									<tr key={entry.eventId} data-source-event-ids={entry.eventId}>
										<th scope="row"><button type="button" onClick={() => focusEvent(entry.eventId, entry.frameIndex)}>
											{entry.eventId} (step {entry.frameIndex + 1})</button></th>
										<td>{pathText(entry.path)}</td>
										<td><CellValue cell={entry.before}
											label={"history before event " + entry.eventId}/></td>
										<td><CellValue cell={entry.after}
											label={"history after event " + entry.eventId}/></td>
									</tr>)}</tbody>
							</table></div>
							{pager("History", currentHistory.page, currentHistory.max, setHistoryPage)}
						</> : <p role="note">No explicit write affects this path through this frame.
							Unknown and absent are not silently converted to known values.</p>}
					</> : <p role="note">Select a source entity to inspect known, unknown or absent
						path values and exact write history.</p>}
					<details><summary>All modeled entity values ({result.state.length})</summary>
						<div className="thl-v2-inspect-table-wrap" role="region" aria-label="Snapshot values: scroll table horizontally" tabIndex={0}><table><caption>Snapshot values, modeled presence is independent</caption>
							<thead><tr><th scope="col">Entity</th><th scope="col">Presence</th>
								<th scope="col">Cell</th></tr></thead>
							<tbody>{result.state.map(row =>
								<tr key={row.entityId} data-source-entity-ids={row.entityId}>
									<th scope="row"><button type="button" onClick={() => chooseEntity(row.entityId)}>
										{row.label}</button></th>
									<td>{row.presentAfter ? "Present" : "Not present"}</td>
									<td><CellValue cell={row.after} label={"snapshot for entity " + row.entityId}/></td>
								</tr>)}</tbody>
						</table></div>
					</details>
				</section>
			</details>
			{trace.artifact.relations.length > 0 && <details name={toolGroup} className="inspect-tool">
				<summary>Message phases</summary>
				<section aria-label="Where did this message go?" className="thl-v2-inspect-section">
					<p>Source-linked phase evidence only. An authored send does not
						imply receipt, processing, acknowledgement or persistence.</p>
					<label>Declared relation
						<select aria-label="Inspect relation" value={relation?.id ?? ""}
							onChange={event => { setRelationId(event.currentTarget.value); setTransferPage(0); }}>
							<option value="">Choose connection</option>
							{trace.artifact.relations.map(relation =>
								<option key={relation.id} value={relation.id}>
									{relation.label ?? relation.id} ({relation.from} → {relation.to})
								</option>)}
						</select>
					</label>
					{relation && <>
						<p>{result.relation?.explanation}</p>
						{transfer.length ? <>
							<p>{transfer.length} explicitly modeled phase event(s) through this frame.</p>
							<ol>{currentTransfer.values.map(evidence =>
								<li key={evidence.eventId} data-source-event-ids={evidence.eventId}
									data-source-relation-ids={relation.id}>
									<strong>{evidence.event.type === "message"
										? evidence.event.phase : evidence.event.type}</strong>,
									{" "}source <code>{evidence.eventId}</code>,
									{" "}{evidence.description}
									{" "}{eventButton(evidence)}
								</li>)}</ol>
							{pager("Transfers", currentTransfer.page, currentTransfer.max, setTransferPage)}
						</> : <p role="note">No message phase evidence on this relation through
							the selected frame. Delivery and failure are not established.</p>}
					</>}
				</section>
			</details>}
			<details name={toolGroup} ref={eventTool} className="inspect-tool">
				<summary>Events and evidence</summary>
				<section aria-label="Why and evidence?" className="thl-v2-inspect-section">
					<p>Inspect the authored event, its declared origin and only explicit
						earlier-event dependencies. Temporal adjacency is not evidence of cause.</p>
					{stepEvidence.length ? <>
						<p>Current chapter: {stepEvidence.length} modeled event(s).</p>
						<ul aria-label="Current chapter source events">
							{currentEvidence.values.map(evidence =>
								<li key={evidence.eventId}>
									{eventButton(evidence)}
									{" "}{evidence.description}
								</li>)}
						</ul>
						{pager("Events", currentEvidence.page, currentEvidence.max, setEventPage)}
					</> : <p role="note">No events are authored in this frame.</p>}
					{result.focused ? <div className="thl-v2-inspect-focus"
						aria-label="Focused source event" role="region"
						data-source-event-ids={result.focused.evidence.eventId}>
						<h5>Event {result.focused.evidence.eventId}</h5>
						<p>{result.focused.evidence.description}</p>
						<p>Declared frame <code>{result.focused.evidence.frameId}</code>;
							{" "}source origin <code>{result.focused.evidence.origin.id}</code>
							{" "}({result.focused.evidence.origin.kind}).</p>
						<RecordedEvidence evidence={result.focused.evidence}/>
						{result.focused.dependencies.length ?
							<><p>Explicitly declared dependencies ({result.focused.dependencies.length});
								this does not establish completeness or scientific causality.</p>
								<ul>{currentDependencies.values.map(dep =>
									<li key={dep.eventId}>{eventButton(dep)} — {dep.description}</li>)}</ul>
								{pager("Dependencies", currentDependencies.page, currentDependencies.max,
									setDependencyPage)}</>
							: <p role="note">No explicit causal dependency is modeled for this event.
								No cause is inferred from nearby events.</p>}
						{claims.length ? <>
							<h5>Editorial claims ({claims.length})</h5>
							<p>Showing {currentClaims.length} of {claims.length} authored claims.
								Each claim also has an independently bounded source-evidence page.</p>
							<ul aria-label="Claims citing focused event">
								{currentClaims.map(claim => <ClaimCard key={claim.claim.id}
									claim={claim} onInspect={inspectEvent}/>)}
							</ul>
							{totalClaimPages > 1 && <div className="thl-v2-inspect-pager"
								role="group" aria-label="Editorial claim pages">
								<button type="button" disabled={activeClaimPage === 0}
									onClick={() => setClaimPage(n => Math.max(0, n - 1))}>
									Previous claims page
								</button>
								<span>Page {activeClaimPage + 1} of {totalClaimPages}</span>
								<button type="button" disabled={activeClaimPage + 1 >= totalClaimPages}
									onClick={() => setClaimPage(n => Math.min(totalClaimPages - 1, n + 1))}>
									Next claims page
								</button>
							</div>}
						</>
							: <p role="note">No editorial claim cites this event.</p>}
					</div> : <p role="note">No authored event is selected.
						There is no explicit causal evidence to evaluate at this frame.</p>}
				</section>
			</details>
			{children && <details name={toolGroup} className="inspect-tool" open={openSequenceLog}>
				<summary>Sequence log</summary>
				{children}
			</details>}
			<details name={toolGroup} className="inspect-tool">
				<summary>Evidence limits</summary>
				<p className="thl-v2-inspect-limit">{result.evidenceLimits}</p>
			</details>
		</section>
	);
}
