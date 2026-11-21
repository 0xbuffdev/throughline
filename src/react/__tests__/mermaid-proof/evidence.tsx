import { useState } from "react";
import type { ViewDescriptor, ViewItem } from "../../../v2/model.js";
import { property } from "./adapter.js";

/** Complete source evidence at the selected frame, independent of SVG windows. */
export function ProofEvidence({ view, onSelect }: {
	view: ViewDescriptor; onSelect: (item: ViewItem) => void;
}): React.JSX.Element {
	const [requestedPage, setPage] = useState(0);
	const events = view.items.filter(item => item.role === "event");
	const page = Math.min(requestedPage, Math.max(0, Math.ceil(events.length / 40) - 1));
	const start = page * 40;
	const counts = { sent: 0, received: 0, acknowledged: 0, processed: 0 };
	for (const event of events) {
		const phase = property(event, "phase");
		if (phase === "sent" || phase === "received" || phase === "acknowledged" || phase === "processed") counts[phase]++;
	}
	return <section aria-label="Complete recorded evidence">
		<p>{events.length} recorded events through {view.frameId}. Message phases: {counts.sent} sent,
			 {counts.received} received, {counts.acknowledged} acknowledged, {counts.processed} processed.</p>
		<p>Authored event order within one atomic step is display order, not verified physical chronology.</p>
		<div style={{ overflowX: "auto" }}><table>
			<caption>Recorded evidence at the selected frame</caption>
			<thead><tr><th>Source event</th><th>Frame</th><th>Kind or phase</th><th>Evidence</th></tr></thead>
			<tbody>{events.slice(start, start + 40).map(event => <tr key={event.id}>
				<th scope="row"><button onClick={() => onSelect(event)}
					data-source-event-ids={event.source.eventIds?.join(" ")}>{event.source.eventIds?.join(", ")}</button></th>
				<td>{String(property(event, "frameId") ?? view.frameId)}</td>
				<td>{String(property(event, "phase") ?? property(event, "type"))}</td>
				<td>{event.description}</td>
			</tr>)}</tbody>
		</table></div>
		<nav aria-label="Complete evidence pages">
			<button disabled={page === 0} onClick={() => setPage(page - 1)}>Earlier evidence</button>{" "}
			<span>{events.length ? start + 1 : 0}–{Math.min(start + 40, events.length)} of {events.length}</span>{" "}
			<button disabled={start + 40 >= events.length} onClick={() => setPage(page + 1)}>Later evidence</button>{" "}
			<button disabled={start + 40 >= events.length} onClick={() => setPage(Math.max(0, Math.ceil(events.length / 40) - 1))}>Latest evidence</button>
		</nav>
	</section>;
}
