import type * as React from "react";
import { useMemo, useState } from "react";
import { projectInspection, type InspectionEvidence, type InspectionView } from "../v2/inspection.js";
import type {
	CompiledTrace, Id, Path, QueryCell, StateChange, TraceInspector,
} from "../v2/model.js";
import { encodeJson } from "../v2/validator.js";

const PAGE = 60;
const PREVIEW = 150;

/** Exact query categories: unknown, absent path, and known JSON null differ. */
function cellText(cell: QueryCell): string {
	switch (cell.status) {
		case "absent": return "Absent at requested path";
		case "unknown": return "Unknown" + (cell.reason ? ": " + cell.reason : "");
		case "known": {
			const value = encodeJson(cell.value);
			return "Known: " + (value.length > PREVIEW
				? value.slice(0, PREVIEW) + "… (truncated preview)" : value);
		}
	}
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
function changeCells(change: StateChange): { before: string; after: string } {
	return change.kind === "write"
		? { before: cellText(change.before), after: cellText(change.after) }
		: { before: change.before ? "Present" : "Not present",
			after: change.after ? "Present" : "Not present" };
}

/** The selected frame's chapter always drives all query results. */
export function InspectPanel({
	trace, inspector, frameIndex, selectedEntityId, onSelectEntity, onSeek,
}: {
	trace: CompiledTrace;
	inspector: TraceInspector;
	frameIndex: number;
	selectedEntityId: Id | null;
	onSelectEntity: (entityId: Id | null) => void;
	onSeek: (frameIndex: number) => void;
}): React.JSX.Element {
	const [compareFrom, setCompareFrom] = useState<number | null>(null);
	const [pathInput, setPathInput] = useState("");
	const [queryPath, setQueryPath] = useState<Path>([]);
	const [pathError, setPathError] = useState("");
	const [relationId, setRelationId] = useState<Id>("");
	const [focusEventId, setFocusEventId] = useState<Id>("");
	const [changePage, setChangePage] = useState(0);
	const [historyPage, setHistoryPage] = useState(0);
	const [transferPage, setTransferPage] = useState(0);
	const [eventPage, setEventPage] = useState(0);

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
	const relation = trace.artifact.relations.find(r => r.id === relationId) ??
		trace.artifact.relations.find(r => selectedEntityId &&
			(r.from === selectedEntityId || r.to === selectedEntityId)) ??
		trace.artifact.relations[0];
	const result: InspectionView = useMemo(() => projectInspection(inspector, {
		frameIndex,
		compareFromIndex: effectiveFrom,
		...(selectedEntityId ? { entityId: selectedEntityId, path: queryPath } : {}),
		...(relation ? { relationId: relation.id } : {}),
		...(effectiveFocus ? { eventId: effectiveFocus } : {}),
	}), [inspector, frameIndex, effectiveFrom, selectedEntityId, queryPath, relation, effectiveFocus]);

	const inspectEvent = (evidence: InspectionEvidence): void => {
		setFocusEventId(evidence.eventId);
		onSeek(evidence.frameIndex);
	};
	const inspectChange = (change: StateChange): void => {
		if (change.kind === "write") {
			onSelectEntity(change.entityId);
			setPathInput(JSON.stringify(change.path));
			setQueryPath(change.path);
			setPathError("");
		} else if (change.target === "entity") onSelectEntity(change.targetId);
		setFocusEventId(change.eventId);
		onSeek(change.frameIndex);
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
				<h3>Inspect — {currentStep.label}</h3>
				<p>Frame {frameIndex + 1} of {inspector.frameCount}, ID <code>{currentStep.frameId}</code>.
					{currentStep.note ? " " + currentStep.note : ""}</p>
				{currentStep.time && <p>
					{currentStep.time.kind === "logical"
						? "Declared logical tick " + currentStep.time.tick
						: "Declared wall-clock timestamp " + currentStep.time.iso8601}.
					This metadata does not establish elapsed duration or cause.
				</p>}
				<p className="thl-v2-inspect-limit">{result.evidenceLimits}</p>
			</header>
			<section aria-label="What changed?" className="thl-v2-inspect-section">
				<h4>What changed?</h4>
				<p>Only explicit writes and presence changes are listed. Same-value
					writes remain visible; message and observation events do not create writes.</p>
				<label>Compare from frame (zero-based)
					<input type="number" min={0} max={frameIndex}
						value={effectiveFrom} aria-label="Compare from frame"
						onChange={event => {
							const n = Number(event.currentTarget.value);
							if (Number.isSafeInteger(n) && n >= 0 && n <= frameIndex) {
								setCompareFrom(n);
								setChangePage(0);
							}
						}}/>
				</label>
				<p>Changes after <code>{result.fromFrameId}</code> through <code>{currentStep.frameId}</code>:
					{" "}{changes.length} explicit mutation(s).</p>
				{changes.length ? <>
					<table><caption>Authored changes, in frame/event order</caption>
						<thead><tr><th scope="col">Source event</th><th scope="col">Target</th>
							<th scope="col">Before</th><th scope="col">After</th></tr></thead>
						<tbody>{currentChanges.values.map(change => {
							const values = changeCells(change);
							return <tr key={change.eventId} data-source-event-ids={change.eventId}
								data-frame-index={frameOf(change)}>
								<th scope="row"><button type="button" onClick={() => inspectChange(change)}>
									{change.eventId} (frame {change.frameIndex})
								</button></th>
								<td>{changeText(change)}{change.kind === "write" &&
									JSON.stringify(change.before) === JSON.stringify(change.after)
									? " — explicit same-value write" : ""}</td>
								<td>{values.before}</td><td>{values.after}</td>
							</tr>;
						})}</tbody>
					</table>
					{pager("Changes", currentChanges.page, currentChanges.max, setChangePage)}
				</> : <p role="note">No explicit write or presence change in this interval.
					This does not mean no messages or observations occurred.</p>}
			</section>
			<section aria-label="What do we know?" className="thl-v2-inspect-section">
				<h4>What do we know?</h4>
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
								maxLength={512} onChange={event => setPathInput(event.currentTarget.value)}
								placeholder={'["balance"]'}/>
						</label>
						<button type="submit">Inspect path</button>
					</form>
					{pathError && <p role="alert">{pathError}</p>}
					<p>Selected <strong>{result.selected.label}</strong>, path
						{" "}<code>{pathText(result.selected.path)}</code>.</p>
					<table>
						<caption>Previous and current modeled state at requested path</caption>
						<thead><tr><th scope="col">Comparison</th>
							<th scope="col">Modeled presence</th><th scope="col">Value</th></tr></thead>
						<tbody><tr><th scope="row">From frame {effectiveFrom}</th>
							<td>{result.selected.presentBefore ? "Present" : "Not present"}</td>
							<td>{cellText(result.selected.before)}</td></tr>
						<tr><th scope="row">Current frame {frameIndex}</th>
							<td>{result.selected.presentAfter ? "Present" : "Not present"}</td>
							<td>{cellText(result.selected.after)}</td></tr></tbody>
					</table>
					<h5>Written-path history ({history.length})</h5>
					{history.length ? <>
						<table><caption>Only explicit overlapping writes through this frame</caption>
							<thead><tr><th scope="col">Written source</th><th scope="col">Target path</th>
								<th scope="col">Before at requested path</th>
								<th scope="col">After at requested path</th></tr></thead>
							<tbody>{currentHistory.values.map(entry =>
								<tr key={entry.eventId} data-source-event-ids={entry.eventId}>
									<th scope="row"><button type="button" onClick={() => {
										setFocusEventId(entry.eventId);
										onSeek(entry.frameIndex);
									}}>{entry.eventId} (frame {entry.frameIndex})</button></th>
									<td>{pathText(entry.path)}</td>
									<td>{cellText(entry.before)}</td>
									<td>{cellText(entry.after)}</td>
								</tr>)}</tbody>
						</table>
						{pager("History", currentHistory.page, currentHistory.max, setHistoryPage)}
					</> : <p role="note">No explicit write affects this path through this frame.
						Unknown and absent are not silently converted to known values.</p>}
				</> : <p role="note">Select a source entity to inspect known, unknown or absent
					path values and exact write history.</p>}
				<details><summary>All modeled entity values ({result.state.length})</summary>
					<table><caption>Snapshot values, modeled presence is independent</caption>
						<thead><tr><th scope="col">Entity</th><th scope="col">Presence</th>
							<th scope="col">Cell</th></tr></thead>
						<tbody>{result.state.map(row =>
							<tr key={row.entityId} data-source-entity-ids={row.entityId}>
								<th scope="row"><button type="button" onClick={() => chooseEntity(row.entityId)}>
									{row.label}</button></th>
								<td>{row.presentAfter ? "Present" : "Not present"}</td>
								<td>{cellText(row.after)}</td>
							</tr>)}</tbody>
					</table>
				</details>
			</section>
			<section aria-label="Where did this message go?" className="thl-v2-inspect-section">
				<h4>Where did this message go?</h4>
				<p>Source-linked phase evidence only. An authored send does not
					imply receipt, processing, acknowledgement or persistence.</p>
				{trace.artifact.relations.length ? <>
					<label>Declared relation
						<select aria-label="Inspect relation" value={relation?.id ?? ""}
							onChange={event => { setRelationId(event.currentTarget.value); setTransferPage(0); }}>
							{trace.artifact.relations.map(relation =>
								<option key={relation.id} value={relation.id}>
									{relation.label ?? relation.id} ({relation.from} → {relation.to})
								</option>)}
						</select>
					</label>
					<p>{result.relation?.explanation}</p>
					{transfer.length ? <>
						<p>{transfer.length} explicitly modeled phase event(s) through this frame.</p>
						<ol>{currentTransfer.values.map(evidence =>
							<li key={evidence.eventId} data-source-event-ids={evidence.eventId}
								data-source-relation-ids={relation?.id}>
								<strong>{evidence.event.type === "message"
									? evidence.event.phase : evidence.event.type}</strong>,
								{" "}source <code>{evidence.eventId}</code>,
								{" "}{evidence.description}
								{" "}{eventButton(evidence)}
							</li>)}</ol>
						{pager("Transfers", currentTransfer.page, currentTransfer.max, setTransferPage)}
					</> : <p role="note">No message phase evidence on this relation through
						the selected frame. Delivery and failure are not established.</p>}
				</> : <p role="note">No declared relations to inspect.</p>}
			</section>
			<section aria-label="Why and evidence?" className="thl-v2-inspect-section">
				<h4>Why? What evidence supports this?</h4>
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
					{result.focused.dependencies.length ?
						<><p>Explicitly declared dependencies ({result.focused.dependencies.length});
							this does not establish completeness or scientific causality.</p>
							<ul>{result.focused.dependencies.map(dep =>
								<li key={dep.eventId}>{eventButton(dep)} — {dep.description}</li>)}</ul></>
						: <p role="note">No explicit causal dependency is modeled for this event.
							No cause is inferred from nearby events.</p>}
					{result.focused.claims.length ? <>
						<h5>Editorial claims ({result.focused.claims.length})</h5>
						<ul>{result.focused.claims.map(claim =>
							<li key={claim.claim.id} data-source-event-ids={
								claim.modeledEvidence.map(e => e.eventId).join(" ")}>
								<strong>{claim.claim.text}</strong>
								{" "}{claim.explanation}
								{claim.unmodeledUntilLater > 0 && <p role="note">
									{claim.unmodeledUntilLater} cited event(s) are not yet
									in this frame; they cannot support the claim here.</p>}
								{claim.modeledEvidence.length > 0 && <ul>{
									claim.modeledEvidence.map(e =>
										<li key={e.eventId}>{eventButton(e)}</li>)
								}</ul>}
							</li>)}</ul>
						</>
						: <p role="note">No editorial claim cites this event.</p>}
				</div> : <p role="note">No authored event is selected.
					There is no explicit causal evidence to evaluate at this frame.</p>}
			</section>
		</section>
	);
}
