import { useState } from "react";
import type * as React from "react";
import type { Id, ViewDescriptor, ViewItem } from "../v2/model.js";
import { laneCenter, type SequenceActor } from "../v2/sequence-layout.js";

function field(item: ViewItem, key: string): unknown {
	const value = item.data;
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)[key] : undefined;
}
const PAGE = 120;

/** Layout reserves declared actors; evidence stays frame-scoped. */
export function SequenceView({ view, actors, present, selectedId, onSelect, onInspect, animate = false }: {
	view: ViewDescriptor;
	actors: readonly SequenceActor[];
	present: ReadonlySet<Id>;
	selectedId: Id | null;
	onSelect: (id: Id) => void;
	onInspect: (id: Id) => void;
	animate?: boolean;
}): React.JSX.Element {
	const [identity, setIdentity] = useState(actors);
 const [maxVisible, setMaxVisible] = useState(PAGE);
 if (identity !== actors) { setIdentity(actors); setMaxVisible(PAGE); }
	const events = view.items.filter(item => item.role === "event");
	const start = Math.max(0, events.length - maxVisible);
	const visible = events.slice(start);
	const last = events.at(-1);
	const lanes = Math.max(1, actors.length);
	const columns = "repeat(" + lanes + ",minmax(0,1fr))";
	const actorIndex = new Map(actors.map((actor, index) => [actor.itemId, index]));
	const evidenced = new Set(view.items.filter(item => item.role === "entity")
		.flatMap(item => item.source.entityIds ?? []));
	return <section className="sequence-view" role="region" aria-label="Message sequence evidence">
		<p className="thl-sr-only">{view.summary} Lanes reserve declared participants;
			an empty lane does not establish a message. Events in one modeled step are atomic facts, not measured chronology.</p>
		<div className="seq-scroll" role="region" aria-label="Sequence lane diagram" tabIndex={0}>
			<div className="seq-world" style={{ minWidth: Math.max(300, lanes * 128) }}>
				<div className="sequence-head" style={{ gridTemplateColumns: columns }} role="group" aria-label="Sequence actors">
					{actors.map(actor => <span key={actor.entityId}>
						<button type="button" aria-pressed={selectedId === actor.entityId}
							aria-label={"Inspect " + actor.label} data-source-entity-ids={actor.entityId}
							data-present={String(present.has(actor.entityId))}
							title={actor.label + (present.has(actor.entityId) ? ": present" : ": not present") +
								(evidenced.has(actor.entityId) ? "" : "; no message evidence through this frame")}
							onClick={() => onSelect(actor.entityId)}>{actor.label}</button>
					</span>)}
				</div>
				<div className="seq-body">
					<div className="lifelines" aria-hidden="true" style={{ gridTemplateColumns: columns }}>
						{actors.map(actor => <i key={actor.entityId} data-lane={actor.entityId}/>)}
					</div>
					<ol className="sequence-list">{visible.map((item, offset) => {
						const message = field(item, "type") === "message";
						const phase = message ? String(field(item, "phase")) : undefined;
						const from = actorIndex.get(item.fromItemId ?? "");
						const to = actorIndex.get(item.toItemId ?? "");
						const connected = message && from !== undefined && to !== undefined;
						const sent = connected && phase === "sent";
						const current = field(item, "current") === true;
						const left = connected ? laneCenter(Math.min(from!, to!), lanes) : 0;
						const span = connected ? Math.abs(to! - from!) * 100 / lanes : 0;
						const self = connected && from === to;
						return <li key={item.id} className={"seq-row " + (current ? "current " : "past ") +
							(sent ? (self ? "self" : to! > from! ? "right" : "left") : "evidence")}
							data-source-event-ids={item.source.eventIds?.join(" ") ?? ""}
							data-source-relation-ids={item.source.relationIds?.join(" ") ?? ""}
							data-source-entity-ids={item.source.entityIds?.join(" ") ?? ""}
							data-message-id={message ? String(field(item, "messageId")) : undefined}
							data-message-phase={phase} data-current-frame={String(current)} title={item.description}>
							<span className="seq-label"><b>{String(start + offset + 1).padStart(2, "0")}</b>
								<button type="button" aria-label={"Inspect " + item.label}
									onClick={() => onInspect(item.id)}><code>{item.label}</code></button></span>
							{sent ? <span className={"seq-line" + (animate && current ? " seq-animate" : "")}
								key={animate && current ? item.id + "-" + view.frameId : item.id}
								style={{ left: left + "%", width: (self ? 36 / lanes : span) + "%" }}
								aria-hidden="true"><i className="seq-arrow"/></span>
								: connected ? <span className="seq-phase" aria-hidden="true"
									style={{ left: laneCenter(to!, lanes) + "%" }}><i/>{phase}</span>
								: <span className="seq-fact">Modeled {String(field(item, "type"))}</span>}
						</li>;
					})}</ol>
					{events.length === 0 && <p className="seq-empty">No modeled events through this frame.</p>}
				</div>
			</div>
		</div>
		<div className="seq-detail"><span>{last ? "Latest evidence" : "No events yet"}</span>
			{last && <p><code>{last.label}</code></p>}
			{events.length > visible.length && <button type="button" className="seq-earlier"
				onClick={() => setMaxVisible(n => Math.min(events.length, n + PAGE))}>
				Show earlier evidence ({visible.length} of {events.length})</button>}
		</div>
	</section>;
}
