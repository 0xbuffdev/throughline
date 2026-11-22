import { chromium, firefox, webkit } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { cpus, platform, release } from "node:os";
import { captureSource, sameSource } from "./mermaid-source-identity.mjs";

const before = captureSource();

const engine = process.argv[2] ?? "chromium";
const type = { chromium, firefox, webkit }[engine];
if (!type) throw new Error("Expected chromium, firefox or webkit");
const base = process.env.THROUGHLINE_PROOF_URL ?? "http://127.0.0.1:5174";
const output = resolve(process.argv[3] ?? "/tmp/throughline-mermaid-proof-" + engine);
mkdirSync(output, { recursive: true });
const customLauncher = engine === "webkit" ? process.env.THROUGHLINE_QA_WEBKIT_EXECUTABLE : undefined;
const browser = await type.launch({ headless: true, ...(customLauncher ? { executablePath: customLauncher } : {}) });
try {
	const page = await browser.newPage({ viewport: { width: 960, height: 900 } });
	const network = [], errors = [];
	await page.route("**/*", route => {
		if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
		network.push(route.request().url()); return route.abort();
	});
	page.on("pageerror", error => errors.push(String(error)));
	await page.goto(base + "/scripts/mermaid-proof.html", { waitUntil: "domcontentloaded" });
	await page.getByRole("group", { name: "Candidate diagram" }).waitFor({ timeout: 60_000 });
	await page.screenshot({ path: join(output, "graph.png"), fullPage: true });
	await page.locator("select").nth(1).selectOption("sequence");
	await page.getByRole("group", { name: "Candidate diagram" }).waitFor();
	await page.screenshot({ path: join(output, "sequence-initial.png"), fullPage: true });
	await page.getByRole("button", { name: "Next frame", exact: true }).click();
	await page.getByRole("group", { name: "Candidate diagram" }).waitFor();
	await page.screenshot({ path: join(output, "sequence-send.png"), fullPage: true });
	await page.setViewportSize({ width: 375, height: 812 });
	await page.screenshot({ path: join(output, "sequence-mobile.png"), fullPage: true });
	const findings = await page.evaluate(async () => {
		const { compileArtifact } = await import("/src/v2/compiler.ts");
		const { inspectTrace } = await import("/src/v2/inspector.ts");
		const { projectView } = await import("/src/v2/views.ts");
		const { layoutGraph, layoutGraphView } = await import("/src/v2/graph-layout.ts");
		const { distributedGraph } = await import("/src/__tests__/v2-graph-fixture.ts");
		const { retryCheckout } = await import("/src/__tests__/v2-sequence-fixture.ts");
		const { graphProof, sequenceProof } = await import("/src/react/mermaid/adapter.ts");
		const { renderProof } = await import("/src/react/mermaid/render.ts");
		const { graphWorkload, sequenceWorkload } = await import("/src/react/__tests__/mermaid-proof/workloads.ts");
		const mount = svg => {
			const host = document.createElement("div"); host.innerHTML = svg;
			host.style.cssText = "position:absolute;top:0;left:0;width:720px;overflow:auto;background:white";
			document.body.append(host); return host;
		};
		const measure = (host, selector) => [...host.querySelectorAll(selector)].map(node => {
			const rect = node.getBoundingClientRect();
			return { id: node.id, classes: node.getAttribute("class"), x: rect.x, y: rect.y, w: rect.width, h: rect.height };
		});
		const graphs = [];
		for (const [entities, relations] of [[8, 12], [64, 160], [200, 1000]]) {
			const trace = compileArtifact(graphWorkload(entities, relations));
			const view = projectView(inspectTrace(trace), { kind: "graph", frameIndex: 0 });
			let start = performance.now(); layoutGraphView(layoutGraph(trace, 720), view);
			const nativeGeometryMs = performance.now() - start;
			start = performance.now(); const proof = graphProof(trace, view); const adapterMs = performance.now() - start;
			const samples = [];
			try {
				let svg;
				for (let run = 0; run < (entities < 200 ? 3 : 1); run++) {
					start = performance.now(); ({ svg } = await renderProof(proof)); samples.push(performance.now() - start);
				}
				const host = mount(svg), scene = host.querySelector("svg");
				graphs.push({ entities, relations, nativeGeometryMs, adapterMs, samplesMs: samples,
					definitionUnits: proof.source.length, svgBytes: new TextEncoder().encode(svg).length,
					viewBox: scene.getAttribute("viewBox"), mappedNodes: host.querySelectorAll("[class$=_source]").length,
					mappedEdges: proof.elements.filter(item => item.role === "relation" &&
						host.querySelectorAll('[data-thl-item-id="' + item.itemId + '"]').length === 1).length,
					rendered: true }); host.remove();
			} catch (error) { graphs.push({ entities, relations, rendered: false, error: String(error), definitionUnits: proof.source.length }); }
		}
		const trace = compileArtifact(distributedGraph()), inspector = inspectTrace(trace);
		const topology = [], widths = [];
		for (const frameIndex of [0, 1, 2, 3, 4, 6, 0]) {
			const proof = graphProof(trace, projectView(inspector, { kind: "graph", frameIndex }));
			const { svg } = await renderProof(proof), host = mount(svg);
			topology.push({ frameIndex, nodes: measure(host, "[class$=_source]") });
			if (frameIndex === 1) for (const width of [260, 320, 375, 720]) {
				host.style.width = width + "px";
				widths.push({ width, viewport: host.clientWidth, scrollWidth: host.scrollWidth,
					nodeFont: getComputedStyle(host.querySelector(".thl_node_0_source text, .thl_node_0_source span")).fontSize });
			}
			host.remove();
		}
		const sequenceTrace = compileArtifact(retryCheckout()), sequenceInspector = inspectTrace(sequenceTrace);
		const lanes = [];
		for (const frameIndex of [0, 1, 2, 9, 0]) {
			const proof = sequenceProof(sequenceTrace, projectView(sequenceInspector, { kind: "sequence", frameIndex }));
			const { svg } = await renderProof(proof), host = mount(svg);
			lanes.push({ frameIndex, actors: measure(host, "rect.actor"), arrows: host.querySelectorAll(".messageLine0,.messageLine1").length,
				notes: host.querySelectorAll(".note").length }); host.remove();
		}
		const large = compileArtifact(sequenceWorkload());
		let start = performance.now();
		const proof = sequenceProof(large, projectView(inspectTrace(large), { kind: "sequence", frameIndex: 100 }));
		const projectionMs = performance.now() - start; start = performance.now();
		const { svg } = await renderProof(proof);
		return { graphs, topology, widths, lanes,
			sequence: { totalEvents: proof.totalEvents, visibleEvents: proof.visibleEvents, projectionMs,
				renderMs: performance.now() - start, svgBytes: new TextEncoder().encode(svg).length },
			heap: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null };
	});
	const after = captureSource();
	const sourceStable = sameSource(before, after);
	const report = { sourceSha: before.sourceSha, dirty: Boolean(before.status), sourceStable,
		inputFingerprint: before.fingerprint, after,
		mermaid: "12.3.0", engine, browserVersion: browser.version(), customLauncher: Boolean(customLauncher), platform: platform(), release: release(),
		cpu: cpus()[0]?.model, network, errors, ...findings };
	writeFileSync(join(output, "measurements.json"), JSON.stringify(report, null, 2) + "\n");
	console.log(JSON.stringify({ output, sourceSha: report.sourceSha, dirty: report.dirty,
		graphs: report.graphs, sequence: report.sequence, network, errors }, null, 2));
	if (errors.length || network.length || !sourceStable) process.exitCode = 1;
} finally { await browser.close(); }
