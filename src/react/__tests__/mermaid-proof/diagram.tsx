import { useEffect, useRef, useState } from "react";
import type { DiagramProof, ProofElement } from "./adapter.js";
import { renderProof } from "./render.js";
import { animateTransfers } from "./motion.js";

/** Test-only lifecycle proof. The host retains frame and semantic selection. */
export function ProofDiagram({ proof, onSelect, renderer = renderProof, motion }: {
	proof: DiagramProof;
	onSelect: (source: ProofElement) => void;
	renderer?: typeof renderProof;
	motion?: { revision: number; durationMs: number; forward: boolean; reducedMotion?: boolean };
}): React.JSX.Element {
	const [output, setOutput] = useState<{ source: string; svg?: string; error?: string }>();
	const cache = useRef(new Map<string, string>());
	const diagram = useRef<HTMLDivElement>(null);
	const [page, setPage] = useState(0);
	const oversized = proof.elements.filter(entry => entry.role === "entity").length > 64 ||
		proof.elements.filter(entry => entry.role === "relation").length > 160;
	useEffect(() => {
		let active = true;
		const controller = new AbortController();
		setPage(0);
		if (oversized) {
			setOutput({ source: proof.source, error: "Diagram exceeds the experimental 64-participant/160-relation display budget. Source evidence remains available below." });
			return;
		}
		const cached = cache.current.get(proof.source);
		if (cached) { setOutput({ source: proof.source, svg: cached }); return; }
		void renderer(proof, controller.signal).then(({ svg }) => {
			if (!active) return;
			cache.current.set(proof.source, svg);
			if (cache.current.size > 3) cache.current.delete(cache.current.keys().next().value!);
			setOutput({ source: proof.source, svg });
		}, () => {
			if (active) setOutput({ source: proof.source, error: "Diagram rendering failed. Source evidence remains available below." });
		});
		return () => { active = false; controller.abort(); };
	}, [proof.source, renderer, oversized]);
	const current = output?.source === proof.source ? output : undefined;
	useEffect(() => {
		if (!diagram.current || !current?.svg || !motion) return;
		const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
		const cancel = animateTransfers(diagram.current, proof, motion.durationMs, motion.forward,
			motion.reducedMotion === true || preference.matches);
		preference.addEventListener("change", cancel);
		return () => { preference.removeEventListener("change", cancel); cancel(); };
	}, [current?.svg, proof, motion]);
	const styles = Object.fromEntries(proof.elements.filter(entry => entry.role === "relation").flatMap(entry => [
		["--thl-flow-" + entry.id + "-stroke", entry.current ? "#2563eb" : "#64748b"],
		["--thl-flow-" + entry.id + "-width", entry.current ? "3px" : "1.5px"],
	])) as React.CSSProperties;
	const entries = proof.elements.slice(page * 40, page * 40 + 40);
	return <section aria-label="Mermaid feasibility candidate" style={styles}>
		{!current && <p role="status">Rendering selected frame…</p>}
		{current?.error && <p role="alert">{current.error}</p>}
		{current?.svg && <div ref={diagram} aria-label="Candidate diagram" role="group"
			style={{ overflow: "auto", maxWidth: "100%", minHeight: 180 }}
			onClick={event => {
				const id = (event.target as Element).closest("[data-thl-item-id]")?.getAttribute("data-thl-item-id");
				const source = proof.elements.find(entry => entry.itemId === id);
				if (source) onSelect(source);
			}}
			onKeyDown={event => {
				if (event.key !== "Enter" && event.key !== " ") return;
				const id = (event.target as Element).closest("[data-thl-item-id]")?.getAttribute("data-thl-item-id");
				const source = proof.elements.find(entry => entry.itemId === id);
				if (source) { event.preventDefault(); event.stopPropagation(); onSelect(source); }
			}}
			dangerouslySetInnerHTML={{ __html: current.svg }} />}
		{proof.diagnostics.map(message => <p key={message} role="note">{message}</p>)}
		<p>Diagram labels abbreviate source text. Select a source for exact identity and evidence.</p>
		<ul aria-label="Exact diagram sources">{entries.map(entry => <li key={entry.id}>
			<button type="button" data-source-item={entry.itemId}
				data-source-entity-ids={entry.source.entityIds?.join(" ")}
				data-source-event-ids={entry.source.eventIds?.join(" ")}
				onClick={() => onSelect(entry)}>{entry.label}</button>
			<span> — {entry.description}</span>
		</li>)}</ul>
		{proof.elements.length > 40 && <nav aria-label="Diagram source pages">
			<button disabled={!page} onClick={() => setPage(page - 1)}>Earlier sources</button>
			<span>{page * 40 + 1}–{Math.min(proof.elements.length, page * 40 + 40)} of {proof.elements.length}</span>
			<button disabled={(page + 1) * 40 >= proof.elements.length}
				onClick={() => setPage(page + 1)}>Later sources</button>
		</nav>}
	</section>;
}
