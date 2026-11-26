import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { retryCheckout } from "../../__tests__/v2-sequence-fixture.js";
import { distributedGraph } from "../../__tests__/v2-graph-fixture.js";
import { EXAMPLES } from "../../examples.js";
import { compileArtifact } from "../../v2/compiler.js";
import { GraphPlayer } from "../graph-player.js";
import { createMermaidPlayerDiagram, MermaidPlayerDiagram } from "../mermaid/player-diagram.js";
import { renderProof } from "../mermaid/render.js";
import { graphWorkload } from "./mermaid-proof/workloads.js";
import { stateEvidenceFixture } from "./state-evidence-fixture.js";
import "../../styles/throughline.css";

it("keeps three Sequence lanes fixed through a send, receipt and explicit reply", async () => {
	const artifact = retryCheckout();
	artifact.relations.push({ id: "reply", from: "gateway", to: "client", label: "Checkout reply" });
	artifact.steps.splice(3, 0, { id: "sendReply", label: "Gateway sends a reply", events: [
		{ id: "replySent", originId: "author", type: "message",
			relationId: "reply", messageId: "reply42", phase: "sent" },
	] });
	artifact.steps.push({ id: "ledgerSend", label: "Send to ledger", events: [
		{ id: "ledgerSent", originId: "author", type: "message",
			relationId: "write", messageId: "ledgerMessage", phase: "sent" },
	] });
	const trace = compileArtifact(artifact);
	const screen = await render(<div style={{ width: 375 }}>
		<GraphPlayer trace={trace} initialView="sequence" DiagramRenderer={MermaidPlayerDiagram}/>
	</div>);
	const diagram = screen.getByRole("region", { name: "Source-linked sequence at current frame" });
	await expect.element(diagram).toBeVisible();
	const lanes = () => [...diagram.element().querySelectorAll(".actor-line")].map(line =>
		[line.getAttribute("data-id"), line.getAttribute("x1")]);
	const initial = lanes();
	expect(initial).toHaveLength(3);
	await expect.element(screen.getByRole("button", { name: "Inspect participant Ledger" })).toBeInTheDocument();
	expect(diagram.element().querySelector(".messageText, .noteText")).toBeNull();

	const cues = new Set<string>();
	const observer = new MutationObserver(records => {
		for (const record of records) for (const node of record.addedNodes) {
			if (node instanceof Element && node.matches("[data-thl-transfer]")) {
				const id = node.getAttribute("data-thl-transfer");
				const caption = diagram.element().querySelector('[data-thl-source-reference][data-thl-item-id="' + id + '"]');
				if (caption && !caption.hasAttribute("data-thl-label-in-motion") && !node.querySelector("text"))
					cues.add(caption.textContent?.replace(/\s/g, "") ?? "");
			}
		}
	});
	observer.observe(screen.getByRole("tabpanel").element(), { childList: true, subtree: true });
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.poll(() => [...cues].some(caption => caption.includes("Checkoutrequest"))).toBe(true);
	expect(lanes()).toEqual(initial);
	const route = diagram.element().querySelector(".messageLine0");
	expect(route?.getAttribute("data-from")).toBe("thl_node_0");
	expect(route?.getAttribute("data-to")).toBe("thl_node_1");
	expect(Number(route?.getAttribute("x2"))).toBeGreaterThan(Number(route?.getAttribute("x1")));

	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.poll(() => diagram.element().querySelector(".noteText")?.textContent).toContain("received");
	expect(lanes()).toEqual(initial);
	expect(diagram.element().querySelectorAll(".messageLine0")).toHaveLength(1);
	expect(diagram.element().querySelector("[data-thl-transfer]")).toBeNull();
	expect(diagram.element().querySelector(".messageLine0[data-thl-route-context]")).not.toBeNull();
	expect(diagram.element().querySelector("[data-thl-phase-item][data-thl-active]")).not.toBeNull();

	await screen.getByRole("button", { name: "Step back" }).click();
	await expect.poll(() => diagram.element().querySelector(".noteText")).toBeNull();
	expect(lanes()).toEqual(initial);
	expect(diagram.element().querySelector("[data-thl-transfer]")).toBeNull();

	const next = screen.getByRole("button", { name: "Step forward" });
	await next.click();
	await expect.poll(() => diagram.element().querySelector(".messageLine0[data-thl-route-context]")).not.toBeNull();
	await next.click();
	await expect.poll(() => diagram.element().querySelector("[data-thl-source], [data-thl-destination]")).toBeNull();
	await next.click();
	await expect.poll(() => [...cues].some(caption => caption.includes("Checkoutreply"))).toBe(true);
	observer.disconnect();
	const reply = diagram.element().querySelector(".messageLine0[data-thl-active]")!;
	expect(reply.getAttribute("data-from")).toBe("thl_node_1");
	expect(reply.getAttribute("data-to")).toBe("thl_node_0");
	expect(Number(reply.getAttribute("x2"))).toBeLessThan(Number(reply.getAttribute("x1")));
	await expect.element(screen.getByRole("button", { name: "Inspect participant Client" }))
		.toHaveAttribute("data-thl-destination", "");
	const viewport = diagram.element();
	const visibleRight = viewport.getBoundingClientRect().left + viewport.clientWidth;
	for (const label of ["Client", "Gateway"]) {
		const header = screen.getByRole("button", { name: "Inspect participant " + label }).element().getBoundingClientRect();
		expect(header.left).toBeGreaterThanOrEqual(viewport.getBoundingClientRect().left);
		expect(header.right).toBeLessThanOrEqual(visibleRight);
	}
	expect(lanes()).toEqual(initial);
	await screen.getByRole("button", { name: "Changes and evidence", exact: true }).click();
	await expect.element(screen.getByRole("region", { name: "Source-event log and correlation details" })).toBeVisible();
	await userEvent.keyboard("{Escape}");
	await expect.element(screen.getByRole("button", { name: "Inspect", exact: true })).toHaveFocus();
}, 60_000);

it("updates Graph transfer paint without relayout and opens the exact source in Inspect", async () => {
	const trace = compileArtifact(EXAMPLES.find(example => example.id === "checkout")!.artifact);
	const screen = await render(<div style={{ width: 720 }}>
		<GraphPlayer trace={trace} initialView="graph" DiagramRenderer={MermaidPlayerDiagram}/>
	</div>);
	const diagram = screen.getByRole("group", { name: "Source-linked graph at current frame" });
	await expect.element(diagram).toBeVisible();
	const route = screen.getByRole("button", { name: "Inspect relation Checkout request" });
	const path = route.element();
	const geometry = path.getAttribute("d");
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.poll(() => diagram.element().querySelector("[data-thl-transfer] text")?.textContent)
		.toBe("Checkout request");
	expect(route.element()).toBe(path);
	expect(path.getAttribute("d")).toBe(geometry);
	await expect.element(route).toHaveAttribute("data-thl-active", "");
	const sourceNode = screen.getByRole("button", { name: "Inspect entity Customer" });
	const targetNode = screen.getByRole("button", { name: "Inspect entity Checkout API" });
	await expect.element(sourceNode).toHaveAttribute("data-thl-source", "");
	await expect.element(targetNode).toHaveAttribute("data-thl-destination", "");
	await expect.element(route).not.toHaveAttribute("data-thl-route-in-motion");
	expect(getComputedStyle(path).markerEnd).toContain("thl-current");
	(path as SVGElement).focus();
	await userEvent.keyboard("{Enter}");
	await expect.element(screen.getByRole("complementary", { name: "Workflow inspector" })).toBeVisible();
	const source = screen.container.querySelector(".inspect-summary");
	expect(source?.getAttribute("data-source-relation-ids")).toBe("request");
	expect(source?.getAttribute("data-source-event-ids")).toBe("requestSent");
	await expect.element(screen.getByRole("heading", { name: "Checkout request", exact: true })).toBeVisible();
	expect(screen.container.querySelector(".thl-v2-inspect")).toBeNull();
}, 60_000);

it("inspects the exact message from its explicit sequence row reference, including when seeking backwards", async () => {
	const trace = compileArtifact(retryCheckout());
	const screen = await render(<GraphPlayer trace={trace} initialView="sequence" DiagramRenderer={MermaidPlayerDiagram}/>);
	await screen.getByRole("button", { name: "Step forward" }).click();
	const arrow = screen.getByRole("button", { name: /^Inspect transfer / });
	await expect.element(arrow).toBeVisible();
	expect(arrow.element().hasAttribute("data-thl-source-reference")).toBe(true);
	(arrow.element() as SVGElement).focus();
	await userEvent.keyboard("{Enter}");
	const panel = screen.getByRole("complementary", { name: "Workflow inspector" });
	await expect.element(panel.getByText("Step 2 of 10", { exact: true })).toBeVisible();
	const phase = (name: string) => panel.getByText(name, { exact: true }).element().nextElementSibling?.textContent;
	expect(phase("sent")).toBe("Recorded");
	expect(phase("received")).toBe("Not recorded");
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(phase("received")).toBe("Recorded");
	await screen.getByRole("button", { name: "Step back" }).click();
	await screen.getByRole("button", { name: "Step back" }).click();
	await expect.element(panel.getByText("This event is outside the current step history.")).toBeVisible();
	expect(panel.element().querySelector('[data-source-event-ids="originalSent"]')).toBeNull();
}, 60_000);

it("keeps graph playback neutral on a write-only step", async () => {
	const trace = compileArtifact(EXAMPLES.find(example => example.id === "factorial")!.artifact);
	const screen = await render(<div style={{ width: 375 }}>
		<GraphPlayer trace={trace} DiagramRenderer={MermaidPlayerDiagram}/>
	</div>);
	const diagram = screen.getByRole("group", { name: "Source-linked graph at current frame" });
	await expect.element(diagram).toBeVisible();
	const camera = diagram.element().getAttribute("viewBox");
	expect(screen.getByRole("tablist").element().textContent).toBe("GraphState");
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(diagram.element().querySelector("[data-thl-active], [data-thl-source], [data-thl-destination], [data-thl-transfer]"))
		.toBeNull();
	expect(diagram.element().getAttribute("viewBox")).toBe(camera);
	await screen.getByRole("tab", { name: "State" }).click();
	await expect.element(screen.getByRole("region", { name: "State and event table" })).toBeVisible();
}, 60_000);

it("keeps the selected Graph tab free of State content during loading", async () => {
	const trace = compileArtifact(EXAMPLES.find(example => example.id === "checkout")!.artifact);
	const screen = await render(<GraphPlayer trace={trace} initialView="state-table" DiagramRenderer={MermaidPlayerDiagram}/>);
	const pane = screen.getByRole("tabpanel").element();
	const graphTab = screen.getByRole("tab", { name: "Graph" });
	const unexpected = () => graphTab.element().getAttribute("aria-selected") === "true" &&
		pane.querySelector(".state-view") !== null;
	const flashes: boolean[] = [];
	const observer = new MutationObserver(() => { if (unexpected()) flashes.push(true); });
	observer.observe(pane, { childList: true, subtree: true, attributes: true });
	try {
		screen.getByRole("tab", { name: "State" }).element().focus();
		await userEvent.keyboard("{ArrowRight}");
		await expect.element(graphTab).toHaveFocus();
		await expect.element(graphTab).toHaveAttribute("aria-selected", "true");
		await expect.element(graphTab).toHaveAttribute("tabindex", "0");
		await expect.element(screen.getByRole("group", { name: "Source-linked graph at current frame" })).toBeVisible();
		expect(unexpected()).toBe(false);
		expect(flashes).toEqual([]);
	} finally {
		observer.disconnect();
	}
}, 60_000);

it("uses the native state and evidence fallback for an oversized graph", async () => {
	const artifact = graphWorkload(65, 66);
	const first = artifact.entities[0];
	artifact.steps = [{ id: "observationStep", label: "Observe", events: [{
		id: "fallbackObservation", originId: artifact.origins[0].id, type: "observation",
		entityId: first.id, value: { status: "known", value: 123 },
	}] }];
	const trace = compileArtifact(artifact);
	const screen = await render(<GraphPlayer trace={trace} initialView="graph" DiagramRenderer={MermaidPlayerDiagram}/>);
	await expect.element(screen.getByText("This diagram exceeds the preview display limit.")).toBeVisible();
	await expect.element(screen.getByRole("region", { name: "State and event table" })).toBeVisible();
	await screen.getByRole("button", { name: "Step forward" }).click();
	const events = screen.getByRole("table", { name: "Current frame event evidence" });
	await expect.element(events).toBeVisible();
	await events.getByRole("button", { name: "Inspect event observation · fallbackObservation", exact: true }).click();
	await expect.element(screen.getByRole("complementary", { name: "Workflow inspector" })).toBeVisible();
	expect(document.querySelector(".inspect-summary h3")?.textContent).toContain("Observation");
}, 60_000);

it("keeps the follow preference through topology without jumping to unrelated focus", async () => {
	const artifact = distributedGraph();
	artifact.steps[3].focusEntityIds = ["worker"];
	const trace = compileArtifact(artifact);
	const screen = await render(<div style={{ width: 720 }}>
		<GraphPlayer trace={trace} initialView="graph" DiagramRenderer={MermaidPlayerDiagram}/>
	</div>);
	const follow = screen.getByRole("button", { name: "Follow transfers" });
	await expect.element(follow).toHaveAttribute("aria-pressed", "true");
	for (let frame = 1; frame <= 4; frame++)
		await screen.getByRole("button", { name: "Step forward" }).click();
	const worker = screen.getByRole("button", { name: "Inspect entity Worker" });
	await expect.element(worker).toBeInTheDocument();
	await expect.element(worker).not.toHaveAttribute("data-thl-destination");
	await expect.element(worker).not.toHaveAttribute("data-thl-source");
	await expect.element(follow).toHaveAttribute("aria-pressed", "true");
	await screen.getByRole("button", { name: "Fit to view" }).click();
	await expect.element(follow).toHaveAttribute("aria-pressed", "false");
}, 60_000);

it("shows the graph reply in its declared direction and does not restart it when switching views", async () => {
	const artifact = retryCheckout();
	artifact.relations.push({ id: "reply", from: "gateway", to: "client", label: "Checkout reply" });
	artifact.steps.splice(1, 0, { id: "sendReply", label: "Gateway sends a reply", events: [
		{ id: "replySent", originId: "author", type: "message",
			relationId: "reply", messageId: "reply42", phase: "sent" },
	] });
	const trace = compileArtifact(artifact);
	const screen = await render(<div style={{ width: 375 }}>
		<GraphPlayer trace={trace} initialView="graph" DiagramRenderer={MermaidPlayerDiagram}/>
	</div>);
	const next = screen.getByRole("button", { name: "Step forward" });
	const reply = screen.getByRole("button", { name: "Inspect relation Checkout reply" });
	await expect.element(reply).toBeInTheDocument();
	await next.click();
	await expect.element(screen.getByRole("button", { name: "Inspect relation Checkout request" }))
		.toHaveAttribute("data-thl-active", "");
	await next.click();
	await expect.element(reply).toHaveAttribute("data-thl-active", "");
	const request = screen.getByRole("button", { name: "Inspect relation Checkout request" });
	await expect.element(request).toHaveAttribute("data-thl-visited", "");
	await expect.element(request).not.toHaveAttribute("data-thl-active");
	expect(getComputedStyle(request.element()).stroke).not.toBe(getComputedStyle(reply.element()).stroke);
	expect(getComputedStyle(request.element()).markerEnd).toContain("thl-visited");
	const path = reply.element() as SVGPathElement;
	const routeStart = path.getPointAtLength(0).matrixTransform(path.getScreenCTM()!);
	const routeEnd = path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM()!);
	const gateway = screen.getByRole("button", { name: "Inspect entity Gateway" });
	await expect.element(gateway).toHaveAttribute("data-thl-source", "");
	const { x, y, width, height } = gateway.element().getBoundingClientRect();
	const distance = (point: DOMPoint) => Math.hypot(point.x - x - width / 2, point.y - y - height / 2);
	expect(distance(routeStart)).toBeLessThan(distance(routeEnd));
	await screen.getByRole("tab", { name: "Sequence" }).click();
	const sequence = screen.getByRole("region", { name: "Source-linked sequence at current frame" });
	await expect.poll(() => sequence.element().querySelector("[data-thl-motion-item][data-thl-active]")).not.toBeNull();
	expect(sequence.element().querySelector("[data-thl-motion-item][data-thl-visited]")).not.toBeNull();
	expect(sequence.element().querySelector("[data-thl-transfer]")).toBeNull();
	await screen.getByRole("tab", { name: "Graph" }).click();
	await expect.element(request).toHaveAttribute("data-thl-visited", "");
	await screen.getByRole("group", { name: "Visualization player" }).element().focus();
	await userEvent.keyboard("{Home}");
	await expect.element(request).not.toHaveAttribute("data-thl-visited");
	await expect.element(reply).not.toHaveAttribute("data-thl-visited");
}, 60_000);

it("follows a wide Sequence arrow across a narrow viewport in both directions", async () => {
	const artifact = retryCheckout();
	artifact.relations[0].to = "ledger";
	artifact.relations.push({ id: "reply", from: "ledger", to: "client", label: "Ledger reply" });
	artifact.steps.splice(1, 0, { id: "sendReply", label: "Ledger sends a reply", events: [
		{ id: "replySent", originId: "author", type: "message",
			relationId: "reply", messageId: "reply42", phase: "sent" },
	] });
	artifact.steps.push({ id: "ledgerSend", label: "Send to ledger", events: [
		{ id: "ledgerSent", originId: "author", type: "message",
			relationId: "write", messageId: "ledgerMessage", phase: "sent" },
	] });
	const screen = await render(<div style={{ width: 260 }}>
		<GraphPlayer trace={compileArtifact(artifact)} initialView="sequence" DiagramRenderer={MermaidPlayerDiagram}/>
	</div>);
	const sequence = screen.getByRole("region", { name: "Source-linked sequence at current frame" });
	await expect.element(sequence).toBeVisible();
	const scrollLeft = () => sequence.element().scrollLeft;
	const next = screen.getByRole("button", { name: "Step forward" });
	await next.click();
	await expect.poll(scrollLeft).toBeGreaterThan(80);
	await expect.poll(() => sequence.element().querySelector("[data-thl-route-in-motion]")).toBeNull();
	const outgoing = scrollLeft();
	await next.click();
	await expect.poll(() => sequence.element().querySelector(".messageLine0[data-thl-active]")?.getAttribute("data-from"))
		.toBe("thl_node_2");
	await expect.poll(scrollLeft).toBeLessThan(outgoing - 25);
	await expect.poll(() => {
		const client = screen.getByRole("button", { name: "Inspect participant Client" }).element();
		return client.getBoundingClientRect().left - sequence.element().getBoundingClientRect().left;
	}).toBeGreaterThan(8);
}, 60_000);

it("follows the latest recorded Sequence event vertically and resets on rewind", async () => {
	const trace = compileArtifact(EXAMPLES.find(example => example.id === "checkout")!.artifact);
	const screen = await render(<div style={{ width: 375 }}>
		<GraphPlayer trace={trace} initialView="sequence" DiagramRenderer={MermaidPlayerDiagram}/>
	</div>);
	const player = screen.getByRole("group", { name: "Visualization player" }).element() as HTMLElement;
	player.style.setProperty("--thl-canvas-height", "270px");
	const sequence = screen.getByRole("region", { name: "Source-linked sequence at current frame" });
	await expect.element(sequence).toBeVisible();
	const scroller = sequence.element();
	await screen.getByRole("button", { name: "Player options" }).click();
	const replyStep = trace.frames.findIndex(frame => frame.id === "sendReply") + 1;
	await screen.getByRole("spinbutton", { name: "Go to step" }).fill(String(replyStep));
	await screen.getByRole("button", { name: "Go", exact: true }).click();
	const provider = screen.getByRole("button", { name: "Inspect participant Simulated provider charges" });
	await expect.element(provider).toHaveAttribute("data-thl-source", "");
	const visibleRight = scroller.getBoundingClientRect().left + scroller.clientWidth;
	expect(provider.element().getBoundingClientRect().right).toBeLessThanOrEqual(visibleRight + 1);
	player.focus();
	await userEvent.keyboard("{End}");
	await expect.poll(() => {
		const header = scroller.querySelector("[data-thl-sequence-header]")?.getBoundingClientRect();
		const current = scroller.querySelector('[data-thl-phase-item][data-thl-active]');
		const mark = current?.getBoundingClientRect();
		const viewport = scroller.getBoundingClientRect();
		return Boolean(scroller.scrollTop > 0 && header && mark &&
			Math.abs(header.top - viewport.top) <= 2 && mark.top > header.bottom && mark.bottom <= viewport.bottom);
	}).toBe(true);
	await userEvent.keyboard("{Home}");
	await expect.poll(() => sequence.element().scrollTop).toBe(0);
	expect(sequence.element().scrollLeft).toBe(0);
	expect(sequence.element().querySelector("[data-thl-motion-item], [data-thl-phase-item]")).toBeNull();
}, 60_000);


it.each(["state-table", "sequence"] as const)("exposes exact current correlations and write evidence in %s including renderer rejection", async mode => {
	const trace = compileArtifact(stateEvidenceFixture());
	let rejected = 0;
	const RejectingRenderer = createMermaidPlayerDiagram((proof, signal) => {
		if (proof.kind === "sequence" && proof.visibleEvents > 0) {
			rejected++;
			return Promise.reject(new Error("controlled renderer rejection"));
		}
		return renderProof(proof, signal);
	});
	const screen = await render(<GraphPlayer trace={trace} initialView={mode} DiagramRenderer={RejectingRenderer}/>);
	const pane = screen.getByRole("tabpanel");
	if (mode === "sequence") {
		await expect.element(screen.getByRole("region", { name: "Source-linked sequence at current frame" })).toBeVisible();
		expect(pane.element().querySelector("svg")).not.toBeNull();
	}
	const next = screen.getByRole("button", { name: "Step forward" });
	await next.click();
	if (mode === "sequence") {
		await expect.element(screen.getByText("The diagram couldn’t be rendered.", { exact: true })).toBeVisible();
		expect(rejected).toBeGreaterThan(0);
		expect(pane.element().querySelector("svg")).toBeNull();
		expect(pane.element().querySelector("[data-thl-item-id]")).toBeNull();
	}
	const table = pane.getByRole("table", { name: "Current frame event evidence" });
	await expect.element(table).toBeVisible();
	const rows = () => [...table.element().querySelectorAll("tbody tr")];
	expect(rows().map(row => row.getAttribute("data-source-event-ids"))).toEqual(["firstSent", "secondSent"]);
	expect(rows()[0].textContent).toContain("message messageOne");
	expect(rows()[0].textContent).not.toContain("messageTwo");
	expect(rows()[1].textContent).toContain("message messageTwo");
	expect(rows()[1].textContent).not.toContain("messageOne");
	expect(rows().every(row => row.getAttribute("data-source-relation-ids") === "request")).toBe(true);
	await table.getByRole("button", { name: "Inspect event sent · secondSent", exact: true }).click();
	const panel = screen.getByRole("complementary", { name: "Workflow inspector" });
	await expect.element(panel).toBeVisible();
	expect(panel.element().querySelector(".inspect-summary")?.getAttribute("data-source-event-ids")).toBe("secondSent");
	await screen.getByRole("button", { name: "Close inspector" }).click();
	await next.click();
	if (mode === "sequence") await expect.element(screen.getByText("The diagram couldn’t be rendered.", { exact: true })).toBeVisible();
	await expect.element(table).toBeVisible();
	expect(rows().map(row => row.getAttribute("data-source-event-ids"))).toEqual(["firstReceived"]);
	expect(rows()[0].textContent).toContain("message messageOne");
	expect(rows()[0].textContent).not.toContain("messageTwo");
	expect(rows()[0].textContent).toContain("received · firstReceived");
	await next.click();
	if (mode === "sequence") await expect.element(screen.getByText("The diagram couldn’t be rendered.", { exact: true })).toBeVisible();
	await expect.element(table).toBeVisible();
	expect(rows().map(row => row.getAttribute("data-source-event-ids"))).toEqual(["commitValue"]);
	expect(rows()[0].textContent).toContain("write · commitValue");
	expect(pane.element().querySelector('.state-view tr[data-source-entity-ids="server"]')?.textContent).toContain("Known: 1");
	await table.getByRole("button", { name: "Inspect event write · commitValue", exact: true }).click();
	expect(panel.element().querySelector(".inspect-summary")?.getAttribute("data-source-event-ids")).toBe("commitValue");
	if (mode === "sequence") expect(pane.element().querySelector("svg")).toBeNull();
}, 60_000);


it("retries a transient render failure without losing the selected frame", async () => {
 const trace = compileArtifact(retryCheckout());
 let attempts = 0;
 const Renderer = createMermaidPlayerDiagram((proof, signal) => ++attempts === 1
  ? Promise.reject(new Error("transient")) : renderProof(proof, signal));
 const screen = await render(<GraphPlayer trace={trace} initialView="sequence" DiagramRenderer={Renderer}/>);
 await expect.element(screen.getByRole("region", { name: "State and event table" })).toBeVisible();
 await screen.getByRole("button", { name: "Retry diagram" }).click();
 await expect.element(screen.getByRole("region", { name: "Source-linked sequence at current frame" })).toBeVisible();
 expect(attempts).toBe(2);
 expect(screen.container.querySelector(".canvas-meta .step-number")?.textContent).toBe("Step 1 of 10");
}, 60_000);

it.each(EXAMPLES.map(example => example.id))("exposes frame-linked graph state for %s without per-frame syntax changes", async id => {
 const source = EXAMPLES.find(example => example.id === id)!.artifact;
 source.steps[0].focusEntityIds = [source.entities[0].id];
 const trace = compileArtifact(source);
 let renders = 0;
 const Renderer = createMermaidPlayerDiagram((proof, signal) => { renders++; return renderProof(proof, signal); });
 const screen = await render(<GraphPlayer trace={trace} initialView="graph" DiagramRenderer={Renderer}/>);
 const strip = screen.getByRole("region", { name: "Graph modeled state" });
 await expect.element(strip).toBeVisible();
 expect(strip.element().querySelectorAll("[data-graph-state-item]").length).toBeGreaterThan(0);
 const initialRenderCount = renders;
 await screen.getByRole("button", { name: "Step forward" }).click();
 const diagram = screen.getByRole("group", { name: "Source-linked graph at current frame" });
 await expect.element(diagram).toBeVisible();
 const inspector = (await import("../../v2/inspector.js")).inspectTrace(trace);
 const view = (await import("../../v2/views.js")).projectView(inspector, { kind: "graph", frameIndex: 1 });
 const { property } = await import("../mermaid/adapter.js");
 const { summarizeCell } = await import("../value-display.js");
 const before = (await import("../mermaid/adapter.js")).graphProof(trace, (await import("../../v2/views.js")).projectView(inspector, { kind: "graph", frameIndex: 0 }));
 const after = (await import("../mermaid/adapter.js")).graphProof(trace, view);
 if (before.source === after.source) expect(renders).toBe(initialRenderCount);
 for (const item of view.items.filter(item => item.role === "entity")) {
  const card = strip.element().querySelector('[data-graph-state-item="' + item.id + '"]');
  expect(card?.textContent).toContain(summarizeCell(property(item, "cell") as import("../../v2/model.js").Cell));
  expect(card?.textContent).toContain("Present");
  const node = diagram.element().querySelector('[data-thl-item-id="' + item.id + '"]');
  expect(node?.querySelector("[data-thl-state-label]")?.textContent).toBe(summarizeCell(property(item, "cell") as import("../../v2/model.js").ReadonlyCell));
  expect(node?.hasAttribute("data-thl-written")).toBe(property(item, "changed") === true);
  expect(node?.hasAttribute("data-thl-focused")).toBe(property(item, "focused") === true);
 }
}, 60_000);


it("offers independent exact sequence source controls for identical sends", async () => {
 const trace = compileArtifact(stateEvidenceFixture());
 const screen = await render(<GraphPlayer trace={trace} initialView="sequence" DiagramRenderer={MermaidPlayerDiagram}/>);
 await screen.getByRole("button", { name: "Step forward" }).click();
 await expect.element(screen.getByRole("region", { name: "Source-linked sequence at current frame" })).toBeVisible();
 await screen.getByText("Sequence source references", { exact: true }).click();
 const list = screen.getByRole("list", { name: "Visible sequence source references" });
 const second = list.element().querySelector<HTMLButtonElement>('[data-source-event-ids="secondSent"]');
 expect(second).not.toBeNull();
 await userEvent.click(second!);
 const inspector = screen.getByRole("complementary", { name: "Workflow inspector" });
 await expect.element(inspector).toBeVisible();
 expect(inspector.element().querySelector(".inspect-summary")?.getAttribute("data-source-event-ids")).toBe("secondSent");
}, 60_000);


it.each([260, 375, 720])("keeps independent exact source selection available when sequence rendering rejects at %ipx", async width => {
 const trace = compileArtifact(stateEvidenceFixture());
 const Renderer = createMermaidPlayerDiagram(async () => { throw new Error("simulated failure"); });
 const screen = await render(<div style={{ width }}><GraphPlayer trace={trace} initialView="sequence" DiagramRenderer={Renderer}/></div>);
 await screen.getByRole("button", { name: "Step forward" }).click();
 await expect.element(screen.getByRole("button", { name: "Retry diagram" })).toBeVisible();
 const disclosure = screen.getByText("Sequence source references", { exact: true });
 const table = screen.getByRole("region", { name: "State and event table" });
 await expect.element(table).toBeVisible();
 expect(disclosure.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(table.element().getBoundingClientRect().top + 1);
 await disclosure.click();
 const list = screen.getByRole("list", { name: "Visible sequence source references" });
 const details = disclosure.element().parentElement!;
 expect(details.getBoundingClientRect().bottom).toBeLessThanOrEqual(table.element().getBoundingClientRect().top + 1);
 const source = list.element().querySelector<HTMLButtonElement>('[data-source-event-ids="secondSent"]');
 expect(source).not.toBeNull();
 await userEvent.click(source!);
 const inspector = screen.getByRole("complementary", { name: "Workflow inspector" });
 await expect.element(inspector).toBeVisible();
 expect(inspector.element().querySelector(".inspect-summary")?.getAttribute("data-source-event-ids")).toBe("secondSent");
}, 60_000);
