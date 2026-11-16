import { useState } from "react";
import type * as React from "react";
import type { Id, ViewDescriptor, ViewItem } from "../v2/model.js";

/** Inert renderer: uses only pure view descriptors, never the trace or a v1 adapter. */
function field(item: ViewItem, key: string): unknown {
	const value = item.data;
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	return (value as Record<string, unknown>)[key];
}
function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}
function phaseCount(value: unknown, key: string): number {
	if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
	const n = (value as Record<string, unknown>)[key];
	return typeof n === "number" && Number.isSafeInteger(n) ? n : 0;
}

const PAGE_SIZE = 120;

/**
 * Detailed source evidence, preserved under the prototype inspector disclosure.
 * Accessible timeline of ALL modeled message evidence through the selected
 * frame; independent bounded tails of message-ID summaries and event rows
 * are mounted. All correlation totals/source IDs remain in the full pure
 * descriptor and are reachable via explicit progressive disclosure.
 * Hiding DOM rows never changes source truth or the projection.
 */
export function SequenceEvidence({
	view, selectedId, onSelect,
}: {
	view: ViewDescriptor;
	selectedId: Id | null;
	onSelect: (id: Id) => void;
}): React.JSX.Element {
	const [maxVisible, setMaxVisible] = useState(PAGE_SIZE);
	const [correlationPage, setCorrelationPage] = useState(0);
	const actors = view.items.filter(item => item.role === "entity");
	const correlations = view.items.filter(item =>
		item.role === "value" && field(item, "type") === "message-correlation");
	const evidence = view.items.filter(item => item.role === "event");
	const start = Math.max(0, evidence.length - maxVisible);
	const mounted = evidence.slice(start);
	// Fixed 120-item window, even after arbitrary navigation. Page zero
	// shows the newest message IDs; earlier/later pages retain full source
	// provenance without ever accumulating an unbounded DOM.
	const totalPages = Math.max(1, Math.ceil(correlations.length / PAGE_SIZE));
	const pageIndex = Math.min(correlationPage, totalPages - 1);
	const correlationEnd = Math.max(0, correlations.length - pageIndex * PAGE_SIZE);
	const correlationStart = Math.max(0, correlationEnd - PAGE_SIZE);
	const mountedCorrelations = correlations.slice(correlationStart, correlationEnd);
	const actorNames = new Map(actors.map(item => [item.id, item.label]));
	const phases = ["sent", "received", "acknowledged", "processed"] as const;
	return (
		<section className="thl-v2-sequence" role="region" aria-label="Source-event log and correlation details">
			<p className="thl-v2-sequence-context">{view.summary}</p>
			<p className="thl-v2-sequence-caution">
				Events follow modeled step and event order, not verified network time.
				No unrecorded send, receipt, acknowledgement, retry, timeout or state change is inferred.
			</p>
			<div className="thl-v2-sequence-actors" role="group" aria-label="Sequence actors">
				{actors.length ? actors.map(item => {
					const id = item.source.entityIds?.[0] ?? "";
					const present = field(item, "present") === true;
					return <button type="button" key={item.id}
						data-source-entity-ids={id}
						aria-pressed={selectedId === id}
						onClick={() => onSelect(id)}
						title={item.description}>
						{item.label} <span>({present ? "present at frame" : "not present at frame"})</span>
					</button>;
				}) : <p>No message endpoints have been modeled through this frame.</p>}
			</div>
			{correlations.length > 0 && <div className="thl-v2-sequence-correlations"
				role="region" aria-label="Message correlations">
				<h3>Messages by declared ID</h3>
				<p>Only explicitly modeled phases are counted. An unmodeled
					acknowledgement is not proof that one was lost.</p>
				<p aria-live="polite">Showing {mountedCorrelations.length} of {correlations.length}
					{" "}message ID(s), page {pageIndex + 1} of {totalPages}.
					All source-linked summaries can be reached without increasing the DOM window.</p>
				<div className="thl-v2-sequence-pages" role="group"
					aria-label="Message correlation pages">
					<button type="button" disabled={correlationStart === 0}
						onClick={() => setCorrelationPage(index => Math.min(totalPages - 1, index + 1))}>
						Show earlier message IDs
					</button>
					<button type="button" disabled={pageIndex === 0}
						onClick={() => setCorrelationPage(index => Math.max(0, index - 1))}>
						Show newer message IDs
					</button>
				</div>
				<ul>{mountedCorrelations.map(item => {
					const counts = field(item, "phases");
					return <li key={item.id}
						data-message-id={text(field(item, "messageId"))}
						data-source-entity-ids={item.source.entityIds?.join(" ") ?? ""}
						data-source-relation-ids={item.source.relationIds?.join(" ") ?? ""}
						data-source-event-ids={item.source.eventIds?.join(" ") ?? ""}>
						<strong>{item.label}</strong>
						<span className="thl-v2-sequence-counts">
							{phases.map(phase => <span key={phase} data-phase={phase}>
								{phase}: {phaseCount(counts, phase) || "not modeled"}
							</span>)}
						</span>
						<details>
							<summary>Correlation and evidence limits</summary>
							<p>{item.description}</p>
						</details>
					</li>;
				})}</ul>
			</div>}
			<div className="thl-v2-sequence-log" role="region"
				aria-label="Sequence evidence timeline">
				<h3>Declared event timeline</h3>
				<p>{evidence.length === 0 ? "No modeled events through this frame." :
					"Showing " + mounted.length + " of " + evidence.length +
					" explicit event(s); older rows can be revealed below."}</p>
				{evidence.length > mounted.length && <button type="button"
					onClick={() => setMaxVisible(n => Math.min(evidence.length, n + PAGE_SIZE))}>
					Show earlier evidence
				</button>}
				{mounted.length > 0 && <table>
					<caption>Source-linked evidence up to {view.frameId}.
						Message phases and independent state/observation events remain distinct.</caption>
					<thead><tr>
						<th scope="col">Step</th>
						<th scope="col">Event</th>
						<th scope="col">Message ID</th>
						<th scope="col">Declared relation</th>
						<th scope="col">Phase / evidence type</th>
						<th scope="col">Declared origin</th>
					</tr></thead>
					<tbody>{mounted.map(item => {
						const type = text(field(item, "type"));
						const message = type === "message";
						const from = item.fromItemId && actorNames.get(item.fromItemId);
						const to = item.toItemId && actorNames.get(item.toItemId);
						const current = field(item, "current") === true;
						const missingSent = field(item, "missingSentThroughStep") === true;
						return <tr key={item.id}
							data-source-event-ids={item.source.eventIds?.join(" ") ?? ""}
							data-source-relation-ids={item.source.relationIds?.join(" ") ?? ""}
							data-source-entity-ids={item.source.entityIds?.join(" ") ?? ""}
							data-message-id={message ? text(field(item, "messageId")) : undefined}
							data-message-phase={message ? text(field(item, "phase")) : undefined}
							data-current-frame={String(current)}
							data-evidence-type={type}
							className={current ? "thl-v2-sequence-current" : undefined}>
							<td>{text(field(item, "frameId"))}</td>
							<th scope="row">
								<details><summary>{item.label}</summary>
									<p>{item.description}</p>
								</details>
							</th>
							<td>{message ? <code>{text(field(item, "messageId"))}</code> : "—"}</td>
							<td>{message ? <>
								{from ?? text(field(item, "fromEntityId"))}
								{" — "}
								{to ?? text(field(item, "toEntityId"))}
							</> : "Not a message"}</td>
							<td>{message ? <>
								<strong>{text(field(item, "phase"))}</strong>
								{missingSent && <span className="thl-v2-sequence-gap">
									No sent modeled through this step
								</span>}
							</> : type + " (not a message phase)"}</td>
							<td>{text(field(item, "originId"))}
								{" (" + text(field(item, "originKind")) + ")"}</td>
						</tr>;
					})}</tbody>
				</table>}
			</div>
		</section>
	);
}
