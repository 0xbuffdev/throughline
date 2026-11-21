import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act } from "react";
import { userEvent } from "vitest/browser";
import { compileArtifact } from "../../../v2/compiler.js";
import { inspectTrace } from "../../../v2/inspector.js";
import { projectView } from "../../../v2/views.js";
import { distributedGraph } from "../../../__tests__/v2-graph-fixture.js";
import { graphProof } from "./adapter.js";
import { ProofDiagram } from "./diagram.js";
import { renderProof } from "./render.js";
import { graphWorkload } from "./workloads.js";

it("discards late output after rapid seeking and selects exact sources through host controls", async () => {
	const trace = compileArtifact(distributedGraph()), inspector = inspectTrace(trace);
	const first = graphProof(trace, projectView(inspector, { kind: "graph", frameIndex: 1 }));
	const next = graphProof(trace, projectView(inspector, { kind: "graph", frameIndex: 4 }));
	const pending: ((value: { svg: string; diagramType: string }) => void)[] = [];
	const renderer: typeof renderProof = () => new Promise(resolve => pending.push(resolve));
	let selected: readonly string[] | undefined;
	const onSelect: React.ComponentProps<typeof ProofDiagram>["onSelect"] = item => {
		selected = item.source.entityIds;
	};
	const screen = await render(<ProofDiagram proof={first} onSelect={onSelect} renderer={renderer} />);
	await screen.rerender(<ProofDiagram proof={next} onSelect={onSelect} renderer={renderer} />);
	await act(async () => { pending[1]({ svg: '<svg><text>Latest frame</text></svg>', diagramType: "flowchart-v2" }); });
	await expect.element(screen.getByRole("group", { name: "Candidate diagram" })).toHaveTextContent("Latest frame");
	await act(async () => { pending[0]({ svg: '<svg><text>Stale frame</text></svg>', diagramType: "flowchart-v2" }); });
	await expect.element(screen.getByRole("group", { name: "Candidate diagram" })).toHaveTextContent("Latest frame");
	await screen.getByRole("button", { name: "Ledger", exact: true }).click();
	expect(selected).toEqual(["ledger"]);
});

it("keeps failures accessible without displaying stale SVG or dropping exact evidence", async () => {
	const trace = compileArtifact(distributedGraph());
	const proof = graphProof(trace, projectView(inspectTrace(trace), { kind: "graph", frameIndex: 1 }));
	const renderer: typeof renderProof = async () => { throw new Error("private renderer internals"); };
	const screen = await render(<ProofDiagram proof={proof} onSelect={() => {}} renderer={renderer} />);
	await expect.element(screen.getByRole("alert")).toHaveTextContent("Diagram rendering failed");
	expect(screen.container.textContent).not.toContain("private renderer internals");
	await expect.element(screen.getByRole("button", { name: "Client", exact: true })).toBeVisible();
	expect(screen.container.querySelector("svg")).toBeNull();
});

it("SSR and initial hydration agree before browser rendering begins", async () => {
	const trace = compileArtifact(distributedGraph());
	const proof = graphProof(trace, projectView(inspectTrace(trace), { kind: "graph", frameIndex: 0 }));
	const renderer: typeof renderProof = () => new Promise(() => {});
	const component = <ProofDiagram proof={proof} onSelect={() => {}} renderer={renderer} />;
	const host = document.createElement("div"); host.innerHTML = renderToString(component);
	const before = host.innerHTML;
	const errors: unknown[] = [];
	document.body.append(host);
	let root: ReturnType<typeof hydrateRoot>;
	await act(async () => { root = hydrateRoot(host, component, { onRecoverableError: error => errors.push(error) }); });
	expect(host.innerHTML).toBe(before);
	expect(errors).toEqual([]);
	await act(async () => { root!.unmount(); }); host.remove();
});

it("reuses graph geometry and updates frame-faithful edge styling without private SVG classes", async () => {
	const trace = compileArtifact(distributedGraph()), inspector = inspectTrace(trace);
	const proofs = [0, 1, 2, 1].map(frameIndex => graphProof(trace,
		projectView(inspector, { kind: "graph", frameIndex })));
	let calls = 0;
	const renderer: typeof renderProof = async (proof, signal) => { calls++; return renderProof(proof, signal); };
	let selectedEvents: readonly string[] | undefined;
	const onSelect: React.ComponentProps<typeof ProofDiagram>["onSelect"] = entry => { selectedEvents = entry.source.eventIds; };
	const screen = await render(<ProofDiagram proof={proofs[0]} onSelect={onSelect} renderer={renderer} />);
	await expect.element(screen.getByRole("group", { name: "Candidate diagram" })).toBeVisible();
	const paths = () => [...screen.container.querySelectorAll<SVGPathElement>("path")];
	const edge = paths().find(path => path.getAttribute("style")?.includes("--thl-flow-thl_link_0-stroke"));
	expect(edge).toBeDefined();
	for (const [index, proof] of proofs.entries()) {
		await screen.rerender(<ProofDiagram proof={proof} onSelect={onSelect} renderer={renderer} />);
		expect(calls).toBe(1);
		expect(getComputedStyle(edge!).stroke).toBe(index % 2 === 1 ? "rgb(37, 99, 235)" : "rgb(100, 116, 139)");
		edge!.focus(); await userEvent.keyboard("{Enter}");
		expect(selectedEvents).toEqual(index === 0 ? undefined : index === 2 ? ["received"] : ["sent"]);
	}
}, 60_000);

it("avoids automatic layout work above the measured diagram display budget", async () => {
	const trace = compileArtifact(graphWorkload(200, 1000));
	const proof = graphProof(trace, projectView(inspectTrace(trace), { kind: "graph", frameIndex: 0 }));
	let calls = 0;
	const renderer: typeof renderProof = async () => { calls++; throw new Error("Must not render"); };
	const screen = await render(<ProofDiagram proof={proof} onSelect={() => {}} renderer={renderer} />);
	await expect.element(screen.getByRole("alert")).toHaveTextContent("display budget");
	expect(calls).toBe(0);
	await expect.element(screen.getByRole("list", { name: "Exact diagram sources" })).toBeVisible();
});

it("consumes a forward motion revision once and never replays it on a group collapse", async () => {
	const trace = compileArtifact(distributedGraph()), inspector = inspectTrace(trace);
	const proof = graphProof(trace, projectView(inspector, { kind: "graph", frameIndex: 1 }));
	const collapsed = graphProof(trace, projectView(inspector, { kind: "graph", frameIndex: 1, collapsedGroupIds: ["back"] }));
	const motion = { revision: 1, forward: true, durationMs: 1500 };
	const screen = await render(<ProofDiagram proof={proof} onSelect={() => {}} motion={motion} />);
	await expect.poll(() => screen.container.querySelectorAll("[data-thl-transfer]").length).toBe(1);
	await screen.rerender(<ProofDiagram proof={collapsed} onSelect={() => {}} motion={motion} />);
	await expect.element(screen.getByRole("group", { name: "Candidate diagram" })).toBeVisible();
	expect(screen.container.querySelector("[data-thl-transfer]")).toBeNull();
}, 60_000);
