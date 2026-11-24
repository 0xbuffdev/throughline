import type * as React from "react";
import { useState } from "react";
import type { Cell, Id, TraceInspector, ViewDescriptor, ViewItem } from "../v2/model.js";
import { CellValue } from "./value-display.js";


function field(item: ViewItem, key: string): unknown {
	return item.data && typeof item.data === "object" && !Array.isArray(item.data) ? item.data[key] : undefined;
}

const EVENT_PAGE = 40;

export function StateView({ view, selectedId, onSelect, onInspectEvent, inspector, frameIndex }: {
	view: ViewDescriptor;
	selectedId: Id | null;
	onSelect: (id: Id) => void;
	onInspectEvent: (id: Id) => void;
	inspector: TraceInspector;
	frameIndex: number;
}): React.JSX.Element {
	const changed = new Set(inspector.diff(Math.max(0, frameIndex - 1), frameIndex)
		.flatMap(change => change.kind === "write" ? [change.entityId] : []));
	return <div className="state-view" role="region" aria-label="State and event table" tabIndex={0}>
		{view.diagnostics?.map(message => <p key={message} role="note">{message}</p>)}
		<table><caption>Modeled state at {view.frameId}</caption>
			<thead><tr><th scope="col">Entity</th><th scope="col">Presence</th>
				<th scope="col">Modeled cell value</th><th scope="col">Last write</th></tr></thead>
			<tbody>{view.items.filter(item => item.role === "value").map(item => {
				const id = item.source.entityIds?.[0] ?? "";
				const present = field(item, "present") === true;
				const cell = field(item, "cell") as Cell;
				const latest = inspector.history(id).filter(entry => entry.frameIndex <= frameIndex).at(-1);
				return <tr key={item.id} data-source-entity-ids={id}
					data-written={String(changed.has(id))} data-selected={String(selectedId === id)}>
					<th scope="row"><button type="button" aria-pressed={selectedId === id}
						onClick={() => onSelect(id)}>{item.label}</button></th>
					<td>{present ? "Present" : "Not present"}</td>
					<td>{!present && <span>Retained modeled cell (entity not present)</span>}
						<CellValue cell={cell} label={"state of " + id}/></td>
					<td>{latest ? <><code>{latest.eventId}</code><span>{latest.originId}</span>
						{changed.has(id) && <span>Written this step</span>}</> : "No writes"}</td>
				</tr>;
			})}</tbody>
		</table>
		<StepEventTable key={frameIndex + ":" + view.frameId} items={view.items.filter(item => item.role === "event")}
			onInspectEvent={onInspectEvent}/>
	</div>;
}


/** Fixed current-frame page; source IDs and event kinds come from projection,
 * not from renderer geometry or inferred message phases. */
function StepEventTable({ items, onInspectEvent }: {
	items: readonly ViewItem[];
	onInspectEvent: (id: Id) => void;
}): React.JSX.Element {
	const [page, setPage] = useState(0);
	const last = Math.max(0, Math.ceil(items.length / EVENT_PAGE) - 1);
	const current = Math.min(page, last);
	const start = current * EVENT_PAGE;
	const visible = items.slice(start, start + EVENT_PAGE);
	return <section className="state-events" aria-label="Explicit events in this frame">
		<h3>Explicit events in this frame</h3>
		<p>Only explicitly modeled event evidence is shown. No other message phase or persistent write is inferred.</p>
		{items.length === 0 ? <p>No events are authored in this frame.</p> : <>
			<p>Showing {start + 1}–{start + visible.length} of {items.length} events.</p>
			<table><caption>Current frame event evidence</caption>
				<thead><tr><th scope="col">Event</th><th scope="col">Declared origin</th>
					<th scope="col">Source evidence</th></tr></thead>
				<tbody>{visible.map(item => {
					const eventId = item.source.eventIds![0];
					return <tr key={item.id} data-source-event-ids={eventId}
						data-source-entity-ids={item.source.entityIds?.join(" ")}
						data-source-relation-ids={item.source.relationIds?.join(" ")}>
						<th scope="row"><button type="button" aria-label={"Inspect event " + eventId}
							onClick={() => onInspectEvent(eventId)}>{item.label}</button></th>
						<td>{String(field(item, "originId"))} ({String(field(item, "originKind"))})</td>
						<td>{item.description}</td>
					</tr>;
				})}</tbody>
			</table>
			{last > 0 && <div className="state-event-pages" role="group" aria-label="Current frame event pages">
				<button type="button" disabled={current === 0}
					onClick={() => setPage(p => Math.max(0, p - 1))}>Previous event page</button>
				<span>Page {current + 1} of {last + 1}</span>
				<button type="button" disabled={current === last}
					onClick={() => setPage(p => Math.min(last, p + 1))}>Next event page</button>
			</div>}
		</>}
	</section>;
}
