import { useState } from "react";
import type * as React from "react";
import type { Id, ViewDescriptor, ViewItem } from "../v2/model.js";

function field(item: ViewItem, key: string): unknown {
 const value = item.data;
 return value && typeof value === "object" && !Array.isArray(value)
  ? (value as Record<string, unknown>)[key] : undefined;
}
const PAGE = 120;

/**
 * The dynamic lane visualization, driven only by the schema-2 sequence
 * projection. Lane identities and events are never hardcoded to the demo.
 * The order is modeled step/event order, not inferred physical chronology.
 */
export function SequenceView({
 view, selectedId, onSelect,
}: {
 view: ViewDescriptor;
 selectedId: Id | null;
 onSelect: (id: Id) => void;
}): React.JSX.Element {
 const [maxVisible, setMaxVisible] = useState(PAGE);
 const actors = view.items.filter(item => item.role === "entity");
 const events = view.items.filter(item => item.role === "event");
 const start = Math.max(0, events.length - maxVisible);
 const visible = events.slice(start);
 const last = events.at(-1);
 const current = last && field(last, "current") === true;
 const lanes = Math.max(1, actors.length);
 const columns = "repeat(" + lanes + ",minmax(0,1fr))";
 const minWidth = Math.max(300, actors.length * 105);
 return <section className="sequence-view" role="region" aria-label="Message sequence evidence">
  <p className="thl-sr-only">{view.summary} Events are in declared order, not physical time.</p>
  <div className="seq-scroll" role="region" aria-label="Sequence lane diagram">
   <div style={{ minWidth }}>
    <div className="sequence-head" style={{ gridTemplateColumns: columns }}
     role="group" aria-label="Sequence actors">
     {actors.length ? actors.map(actor => {
      const id = actor.source.entityIds?.[0] ?? "";
      return <span key={actor.id}>
       <button type="button" aria-pressed={selectedId === id}
        aria-label={"Inspect " + actor.label}
        data-source-entity-ids={id} title={actor.description}
        onClick={() => onSelect(id)}>{actor.label}</button>
      </span>;
     }) : <span>No declared message endpoints</span>}
    </div>
    <div className="seq-body">
     <div className="lifelines" aria-hidden="true" style={{ gridTemplateColumns: columns }}>
      {Array.from({ length: lanes }, (_, index) => <i key={index}/>)}
     </div>
     <ol className="sequence-list">
      {visible.map((item, offset) => {
       const type = field(item, "type");
       const message = type === "message";
       const from = actors.findIndex(actor => actor.id === item.fromItemId);
       const to = actors.findIndex(actor => actor.id === item.toItemId);
       const connected = message && from >= 0 && to >= 0;
       const self = from === to;
       const direction = to > from ? "right" : "left";
       const state = field(item, "current") === true ? "current" : "past";
       const lo = Math.min(from, to), hi = Math.max(from, to);
       const startCol = self ? lo + 1 : lo + 1;
       const endCol = self ? startCol + 1 : hi + 2;
       const phase = field(item, "phase");
       return <li key={item.id}
        className={"seq-row " + state + " " + (connected ? (self ? "self" : direction) : "evidence")}
        style={{ gridTemplateColumns: columns }}
        data-source-event-ids={item.source.eventIds?.join(" ") ?? ""}
        data-source-relation-ids={item.source.relationIds?.join(" ") ?? ""}
        data-source-entity-ids={item.source.entityIds?.join(" ") ?? ""}
        data-message-id={message ? String(field(item, "messageId") ?? "") : undefined}
        data-message-phase={message ? String(phase ?? "") : undefined}
        data-current-frame={String(field(item, "current") === true)}
        title={item.description}>
        {connected ? <span className="seq-line"
         style={{ gridColumn: String(startCol) + " / " + String(endCol) }}>
         <span className="seq-label">
          <b>{String(start + offset + 1).padStart(2, "0")}</b>
          <code>{item.label}</code>
         </span>
         <i className="seq-arrow"/>
        </span> : <span className="seq-non-message" style={{ gridColumn: "1 / -1" }}>
         <b>{String(start + offset + 1).padStart(2, "0")}</b>
         <code>{item.label}</code>
        </span>}
       </li>;
      })}
     </ol>
    </div>
   </div>
  </div>
  <div className="seq-detail" aria-live="polite">
   <span>{last ? (current ? "NOW" : "LATEST") : "NO EVENTS YET"}</span>
   {last && <p><code>{last.label}</code></p>}
   {events.length > visible.length && <button type="button"
    className="seq-earlier" onClick={() => setMaxVisible(n => Math.min(events.length, n + PAGE))}>
    Show earlier evidence ({visible.length} of {events.length})
   </button>}
  </div>
 </section>;
}
