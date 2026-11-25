import type { Mermaid, RenderResult } from "mermaid";
import type { DiagramProof } from "./adapter.js";

export type RenderedDiagram = RenderResult & { width: number; height: number };

let serial = Promise.resolve();
let identity = 0;

/** Share concurrent initialization, but never permanently cache a rejection. */
export function retryableLoader<T>(initialize: () => Promise<T>): () => Promise<T> {
	let pending: Promise<T> | undefined;
	return () => {
		if (pending) return pending;
		const attempt = Promise.resolve().then(initialize);
		pending = attempt;
		void attempt.catch(() => { if (pending === attempt) pending = undefined; });
		return attempt;
	};
}

const load = retryableLoader(async (): Promise<Mermaid> => {
	// Use Mermaid's separate ESM distribution so a host's ordinary package
	// import can keep its own site configuration and diagram queue.
	const { default: mermaid } = await import("mermaid/dist/mermaid.esm.min.mjs");
	mermaid.initialize({
			startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true, htmlLabels: true,
			theme: "base", look: "classic", layout: "elk",
			deterministicIds: true, maxTextSize: 300_000, maxEdges: 1_000,
			fontFamily: "Arial, sans-serif", fontSize: 12,
			themeVariables: { fontFamily: "Arial, sans-serif", fontSize: "12px",
				primaryColor: "#f8fafc", primaryTextColor: "#0f172a", primaryBorderColor: "#94a3b8",
				lineColor: "#64748b", secondaryColor: "#f1f5f9", tertiaryColor: "#ffffff",
				nodeShadow: false },
			flowchart: { useMaxWidth: false, padding: 8, minNodeWidth: 64,
				nodeSpacing: 24, rankSpacing: 48 },
			elk: { preset: "modelOrder", keepEntryNodeOnTop: true, orientFeedbackEdges: true },
			sequence: { useMaxWidth: false, actorMargin: 24, width: 100, height: 40,
				actorFontSize: 11, noteFontSize: 11, messageFontSize: 11,
				diagramMarginX: 10, diagramMarginY: 8, noteMargin: 6,
				messageMargin: 18, mirrorActors: false, wrap: false, wrapPadding: 4,
				rightAngles: true },
	});
	return mermaid;
});

const svgNS = "http://www.w3.org/2000/svg";

function bindDirection(root: SVGSVGElement, route: SVGElement): void {
	// Keep the renderer's original marker for the overview and use its
	// geometry for an emphasized arrowhead that matches the route color.
	const reference = route.getAttribute("marker-end");
	if (!reference?.startsWith("url(#")) throw new Error("Rendered route has no destination marker");
	const id = reference.slice(5, -1);
	const marker = [...root.querySelectorAll("marker")].find(node => node.id === id);
	if (!marker) throw new Error("Rendered route has no destination marker");
	for (const state of ["current", "visited"] as const) {
		const emphasis = id + "-thl-" + state;
		if (!marker.parentElement?.querySelector('[id="' + emphasis + '"]')) {
			const variant = marker.cloneNode(true) as SVGMarkerElement;
			variant.id = emphasis;
			variant.setAttribute("data-thl-direction-marker", state);
			marker.after(variant);
		}
		route.style.setProperty("--thl-direction-" + state + "-marker", "url(#" + emphasis + ")");
	}
}

/** Bind host-authored paint/row tokens to the current descriptor. Graph
 * tokens do not rely on generated SVG IDs; Sequence still has a pinned local
 * caption/mark bridge. Source controls provide an independent text path.
 * Missing/duplicated/ambiguous routes fail closed rather than guessing.
 */
export function bindSources(svg: string, proof: DiagramProof): Pick<RenderedDiagram, "svg" | "width" | "height"> {
	const template = document.createElement("template"); template.innerHTML = svg;
	const root = template.content.querySelector("svg");
	if (!root || template.content.querySelector("script, img, image, a, [onerror], [onclick]"))
		throw new Error("Unsupported rendered SVG");
	// The host supplies the diagram's accessible name and interactive scope.
	root.removeAttribute("role");
	root.removeAttribute("aria-roledescription");
	root.removeAttribute("aria-labelledby");
	root.removeAttribute("aria-describedby");
	if (proof.kind === "sequence") {
		// Bind explicit adapter-authored text references, not just endpoint
		// equality and array position. The SVG bridge remains version-pinned;
		// count, order, local caption association and endpoint checks fail closed.
		const events = proof.elements.filter(entry => entry.role === "event");
		const byToken = new Map(events.map(entry => [entry.rowToken, entry]));
		if (byToken.size !== events.length || byToken.has(undefined))
			throw new Error("Sequence proof lacks unique source references");
		const bound = new Set<string>();
		const resolve = (labels: readonly Element[], sent: boolean) => {
			// The adapter reserves all reference-shaped authored caption strings
			// before assigning references. Only allocated references are metadata;
			// the exact allocated token must occur once and terminate the caption.
			const tokens = labels.flatMap(node => node.textContent?.match(/TL\d{6}/g) ?? [])
				.filter(token => byToken.has(token));
			const terminal = labels.at(-1)?.textContent?.trimEnd();
			const entry = tokens.length === 1 && terminal?.endsWith(tokens[0]) ? byToken.get(tokens[0]) : undefined;
			if (!entry || entry.sent !== sent || bound.has(entry.itemId))
				throw new Error("Ambiguous rendered sequence source reference");
			bound.add(entry.itemId);
			return entry;
		};
		const sends = events.filter(entry => entry.sent);
		const arrows = [...root.querySelectorAll<SVGElement>(".messageLine0, .messageLine1")];
		if (arrows.length !== sends.length) throw new Error("Rendered message mapping unavailable");
		let lastLineY = -Infinity;
		arrows.forEach((arrow, index) => {
			const labels: Element[] = [];
			for (let label = arrow.previousElementSibling; label?.matches(".messageText");
				label = label.previousElementSibling) labels.unshift(label);
			const entry = resolve(labels, true);
			if (entry !== sends[index] ||
				arrow.getAttribute("data-from") !== "thl_" + entry.fromItemId ||
				arrow.getAttribute("data-to") !== "thl_" + entry.toItemId)
				throw new Error("Rendered message mapping unavailable");
			// Normal line rows must retain their vertical order as well as the
			// explicit caption token. Never trust swapped same-endpoint lines.
			if (arrow.localName === "line") {
				const y = Number(arrow.getAttribute("y1"));
				if (!arrow.hasAttribute("y1") || !Number.isFinite(y) || y <= lastLineY)
					throw new Error("Rendered message geometry order unavailable");
				lastLineY = y;
			}
			const id = entry.itemId;
			arrow.setAttribute("data-thl-motion-item", id);
			arrow.setAttribute("data-thl-item-id", id);
			bindDirection(root, arrow);
			bindItem(labels[0], id, "Inspect transfer " + (entry.flowLabel ?? entry.label));
			for (const label of labels) {
				label.setAttribute("data-thl-motion-label", id);
				label.setAttribute("data-thl-item-id", id);
			}
		});
		const phases = events.filter(entry => !entry.sent);
		const notes = [...root.querySelectorAll(".note")];
		if (notes.length !== phases.length) throw new Error("Rendered message phase mapping unavailable");
		notes.forEach((note, index) => {
			const group = note.parentElement;
			if (!group || group.querySelectorAll(".note").length !== 1)
				throw new Error("Ambiguous rendered phase group");
			const entry = resolve([...group.querySelectorAll(".noteText")], false);
			if (entry !== phases[index]) throw new Error("Rendered phase order unavailable");
			group.setAttribute("data-thl-phase-item", entry.itemId);
			bindItem(group, entry.itemId, "Inspect " + entry.label);
		});
		if (bound.size !== events.length) throw new Error("Incomplete sequence source mapping");

		const lifelines = root.querySelectorAll<SVGLineElement>(".actor-line");
		const actors = proof.elements.filter(entry => entry.role === "entity");
		if (lifelines.length !== actors.length) throw new Error("Rendered participant lanes unavailable");
		const box = root.viewBox.baseVal;
		const { x, y, width } = box;
		const height = Math.max(box.height + 18, 180);
		root.setAttribute("viewBox", [x, y, width, height].join(" "));
		for (const line of lifelines) line.setAttribute("y2", String(y + height - 8));
		const head = document.createElementNS(svgNS, "g");
		head.setAttribute("data-thl-sequence-header", "");
		const backdrop = document.createElementNS(svgNS, "rect");
		backdrop.setAttribute("x", String(x));
		backdrop.setAttribute("y", String(y));
		backdrop.setAttribute("width", String(width));
		backdrop.setAttribute("fill", "var(--thl-bg, white)");
		head.append(backdrop);
		let headerBottom = 0;
		for (const entry of actors) {
			const matches = root.querySelectorAll('[data-et="participant"][data-id="' + entry.id + '"]');
			const node = matches[0];
			const rect = node?.querySelector(".actor-top");
			if (matches.length !== 1 || !node || !rect) throw new Error("Rendered participant mapping unavailable");
			headerBottom = Math.max(headerBottom, Number(rect.getAttribute("y")) + Number(rect.getAttribute("height")));
			bindItem(node, entry.itemId, "Inspect participant " + entry.label);
			head.append(node);
		}
		backdrop.setAttribute("height", String(headerBottom - y));
		root.append(head);
		return normalizedSize(root);
	}
	const routes = proof.elements.filter(entry => entry.role === "relation");
	const tokens = new Map(routes.flatMap(entry => {
		const hex = entry.strokeToken!, number = Number.parseInt(hex.slice(1), 16);
		return [[hex, entry], ["rgb(" + (number >> 16) + "," + ((number >> 8) & 255) + "," + (number & 255) + ")", entry]] as const;
	}));
	const found = new Set<string>();
	for (const node of root.querySelectorAll<SVGElement>("[style]")) {
		const entry = tokens.get(node.style.getPropertyValue("stroke").replace(/\s/g, "").toLowerCase());
		if (!entry) continue;
		if (found.has(entry.itemId)) throw new Error("Ambiguous rendered relation mapping");
		found.add(entry.itemId);
		node.style.setProperty("stroke", "var(--thl-flow-" + entry.id + "-stroke, var(--thl-diagram-edge, #64748b))", "important");
		node.style.setProperty("stroke-width", "var(--thl-flow-" + entry.id + "-width, var(--thl-diagram-edge-width, 1.5px))", "important");
		node.setAttribute("data-thl-motion-item", entry.itemId);
		bindDirection(root, node);
		bindItem(node, entry.itemId, "Inspect relation " + entry.label);
	}
	if (found.size !== routes.length) throw new Error("Rendered relation mapping unavailable");
	for (const entry of proof.elements.filter(item => item.role === "entity" || item.collapsed)) {
		const nodes = root.getElementsByClassName(entry.id + "_source");
		if (nodes.length !== 1) throw new Error("Rendered entity mapping unavailable");
		bindItem(nodes[0], entry.itemId, (entry.collapsed ? "Expand group " : "Inspect entity ") + entry.label);
	}
	for (const entry of proof.elements.filter(item => item.role === "group" && !item.collapsed)) {
		// Region geometry is optional. Group selection uses the host's source control.
		const region = root.querySelector('.cluster[id="' + entry.id + '"]');
		region?.setAttribute("data-thl-region-id", entry.itemId);
	}
	return normalizedSize(root);
}

function normalizedSize(root: SVGSVGElement): Pick<RenderedDiagram, "svg" | "width" | "height"> {
	const { width, height } = root.viewBox.baseVal;
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
		throw new Error("Rendered diagram has no usable viewport");
	root.setAttribute("width", String(width));
	root.setAttribute("height", String(height));
	return { svg: root.outerHTML, width, height };
}

function bindItem(node: Element, id: string, label: string): void {
	node.setAttribute("data-thl-item-id", id);
	node.setAttribute("tabindex", "0");
	node.setAttribute("role", "button");
	node.setAttribute("aria-label", label);
}

/** Serialize the library's global render lifecycle; never install Mermaid callbacks. */
export async function renderProof(proof: DiagramProof, signal?: AbortSignal,
	/** Internal feasibility seam for corrupting real renderer output before binding. */
	transformRawForTest?: (svg: string) => string): Promise<RenderedDiagram> {
	const check = () => {
		if (signal?.aborted) throw new DOMException("Diagram request canceled", "AbortError");
	};
	check();
	const mermaid = await load();
	const render = serial.then(async () => {
		check();
		const source = proof.kind === "graph"
			? "---\nconfig:\n  look: neo\n---\n" + proof.source
			: proof.source;
		await mermaid.parse(source);
		check();
		const output = await mermaid.render("thl_proof_" + ++identity, source);
		check();
		return { ...output, ...bindSources(transformRawForTest ? transformRawForTest(output.svg) : output.svg, proof) };
	});
	serial = render.then(() => undefined, () => undefined);
	return render;
}
