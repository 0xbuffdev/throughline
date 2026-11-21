import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { EXAMPLES } from "../src/examples.js";
import { compileArtifact } from "../src/v2/compiler.js";
import { inspectTrace } from "../src/v2/inspector.js";
import { projectView } from "../src/v2/views.js";
import { ThroughlineGraphPlayer } from "../src/react/graph-player.js";
import { graphProof, sequenceProof, type ProofElement } from "../src/react/__tests__/mermaid-proof/adapter.js";
import { ProofDiagram } from "../src/react/__tests__/mermaid-proof/diagram.js";
import "../src/styles/throughline.css";

function App(): React.JSX.Element {
	const [example, setExample] = useState(3), [frameIndex, setFrame] = useState(0);
	const [kind, setKind] = useState<"graph" | "sequence">("graph");
	const [direction, setDirection] = useState<"LR" | "TB">("LR");
	const [selected, setSelected] = useState<ProofElement>();
	const [collapsed, setCollapsed] = useState<string[]>([]);
	const [motion, setMotion] = useState({ revision: 0, durationMs: 700, forward: false });
	const trace = useMemo(() => compileArtifact(EXAMPLES[example].artifact), [example]);
	const inspector = useMemo(() => inspectTrace(trace), [trace]);
	const view = useMemo(() => projectView(inspector, { kind, frameIndex, collapsedGroupIds: collapsed }),
		[inspector, kind, frameIndex, collapsed]);
	const proof = useMemo(() => view.kind === "sequence" ? sequenceProof(trace, view)
		: view.kind === "graph" ? graphProof(trace, view, direction) : undefined, [trace, view, direction]);
	return <main style={{ maxWidth: 1000, margin: "auto", padding: 12, font: "13px Arial, sans-serif", overflowWrap: "anywhere" }}>
		<h1>Mermaid feasibility — test host</h1>
		<p>Candidate rendering only. Production player and public package exports are unchanged.</p>
		<div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
			<label>Example <select value={example} onChange={event => {
				setExample(Number(event.target.value)); setFrame(0); setCollapsed([]); setSelected(undefined);
				setMotion({ ...motion, forward: false });
			}}>{EXAMPLES.map((entry, index) => <option key={entry.id} value={index}>{entry.title}</option>)}</select></label>
			<label>View <select value={kind} onChange={event => { setKind(event.target.value as typeof kind); setMotion({ ...motion, forward: false }); }}>
				<option value="graph">Graph</option><option value="sequence">Sequence</option>
			</select></label>
			<label>Direction <select value={direction} onChange={event => { setDirection(event.target.value as typeof direction); setMotion({ ...motion, forward: false }); }}>
				<option>LR</option><option>TB</option>
			</select></label>
		</div>
		<p><button disabled={frameIndex === 0} onClick={() => {
			setMotion({ ...motion, revision: motion.revision + 1, forward: false }); setFrame(frameIndex - 1);
		}}>Previous frame</button>{" "}
			<button disabled={frameIndex === trace.frames.length - 1} onClick={() => {
				setMotion({ ...motion, revision: motion.revision + 1, forward: true }); setFrame(frameIndex + 1);
			}}>Next frame</button>{" "}
			<label>Frame <input type="range" min={0} max={trace.frames.length - 1} value={frameIndex}
				onChange={event => { setFrame(Number(event.target.value)); setMotion({ ...motion, forward: false }); }} /></label>{" "}
			<output>{frameIndex}: {trace.frames[frameIndex].label}</output>
		</p>
		<div>{trace.artifact.groups?.map(group => <button key={group.id} aria-pressed={collapsed.includes(group.id)}
			onClick={() => setCollapsed(current => current.includes(group.id)
				? current.filter(id => id !== group.id) : [...current, group.id])}>{group.label}</button>)}</div>
		{proof ? <ProofDiagram proof={proof} onSelect={setSelected} motion={motion} /> : <p role="note">{view.diagnostics?.join(" ")}</p>}
		{selected && <section aria-label="Selected exact source"><h2>{selected.label}</h2>
			<p>{selected.description}</p><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(selected.source, null, 2)}</pre>
			{selected.source.entityIds?.map(id => <pre key={id} style={{ whiteSpace: "pre-wrap" }}>
				{id + ": " + JSON.stringify(inspector.valueAt(frameIndex, id))}</pre>)}
		</section>}
		<details><summary>Generated syntax</summary><pre style={{ whiteSpace: "pre-wrap" }}>{proof?.source}</pre></details>
		<details><summary>Current native player baseline (independent controls)</summary>
			<ThroughlineGraphPlayer trace={trace} initialView="graph" />
		</details>
	</main>;
}

createRoot(document.getElementById("root")!).render(<App />);
