import type * as React from "react";
import type { Cell, Id, TraceInspector, ViewDescriptor, ViewItem } from "../v2/model.js";
import { CellValue } from "./value-display.js";

function field(item: ViewItem, key: string): unknown {
	return item.data && typeof item.data === "object" && !Array.isArray(item.data) ? item.data[key] : undefined;
}

export function StateView({ view, selectedId, onSelect, inspector, frameIndex }: {
	view: ViewDescriptor;
	selectedId: Id | null;
	onSelect: (id: Id) => void;
	inspector: TraceInspector;
	frameIndex: number;
}): React.JSX.Element {
	const changed = new Set(inspector.diff(Math.max(0, frameIndex - 1), frameIndex)
		.flatMap(change => change.kind === "write" ? [change.entityId] : []));
	return <div className="state-view" role="region" aria-label="State and event table" tabIndex={0}>
		{view.diagnostics?.map(message => <p key={message} role="note">{message}</p>)}
		<table><caption>Modeled state at {view.frameId}</caption>
			<thead><tr><th scope="col">Entity</th><th scope="col">Presence</th>
				<th scope="col">Current value</th><th scope="col">Last write</th></tr></thead>
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
					<td><CellValue cell={present ? cell : { status: "absent" }} label={"state of " + id}/></td>
					<td>{latest ? <><code>{latest.eventId}</code><span>{latest.originId}</span>
						{changed.has(id) && <span>Written this step</span>}</> : "No writes"}</td>
				</tr>;
			})}</tbody>
		</table>
	</div>;
}
