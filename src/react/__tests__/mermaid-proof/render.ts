import type { Mermaid, RenderResult } from "mermaid";
import type { DiagramProof } from "./adapter.js";

let library: Promise<Mermaid> | undefined;
let serial = Promise.resolve();
let identity = 0;

async function load(): Promise<Mermaid> {
	return library ??= import("mermaid").then(({ default: mermaid }) => {
		mermaid.initialize({
			startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true, htmlLabels: true,
			theme: "base", look: "classic", layout: "elk",
			deterministicIds: true, maxTextSize: 300_000, maxEdges: 1_000,
			fontFamily: "Arial, sans-serif", fontSize: 12,
			themeVariables: { fontFamily: "Arial, sans-serif", fontSize: "12px",
				primaryColor: "#f8fafc", primaryTextColor: "#0f172a", primaryBorderColor: "#94a3b8",
				lineColor: "#64748b", secondaryColor: "#f1f5f9", tertiaryColor: "#ffffff" },
			flowchart: { useMaxWidth: false, padding: 8, nodeSpacing: 24, rankSpacing: 48 },
			sequence: { useMaxWidth: false, actorMargin: 36, width: 110, height: 36,
				actorFontSize: 12, noteFontSize: 12, messageFontSize: 12,
				messageMargin: 32, mirrorActors: false, wrap: false },
		});
		return mermaid;
	});
}

/** Bind host-authored paint tokens, not Mermaid's private IDs/classes/ordering.
 * Essential interactions resolve the resulting own item ID through the current
 * descriptor. Missing/duplicated routes fail closed rather than guessing.
 */
function bindSources(svg: string, proof: DiagramProof): string {
	const template = document.createElement("template"); template.innerHTML = svg;
	const root = template.content.querySelector("svg");
	if (!root || template.content.querySelector("script, img, image, a, [onerror], [onclick]"))
		throw new Error("Unsupported rendered SVG");
	if (proof.kind === "sequence") {
		// A version-pinned cosmetic bridge for the flat outbound-only grammar.
		// Private selectors never supply essential selection or source truth.
		// A changed renderer shape disables motion instead of guessing a match.
		const sends = proof.elements.filter(entry => entry.role === "event" && entry.sent);
		const arrows = root.querySelectorAll(".messageLine0, .messageLine1");
		if (arrows.length === sends.length) arrows.forEach((arrow, index) =>
			arrow.setAttribute("data-thl-motion-item", sends[index].itemId));
		return root.outerHTML;
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
		node.style.setProperty("stroke", "var(--thl-flow-" + entry.id + "-stroke, #64748b)", "important");
		node.style.setProperty("stroke-width", "var(--thl-flow-" + entry.id + "-width, 1.5px)", "important");
		node.setAttribute("data-thl-item-id", entry.itemId);
		node.setAttribute("data-thl-motion-item", entry.itemId);
		node.setAttribute("tabindex", "0"); node.setAttribute("role", "button");
		node.setAttribute("aria-label", "Inspect relation " + entry.label);
	}
	if (found.size !== routes.length) throw new Error("Rendered relation mapping unavailable");
	for (const entry of proof.elements.filter(item => item.role === "entity")) {
		const nodes = root.getElementsByClassName(entry.id + "_source");
		if (nodes.length !== 1) throw new Error("Rendered entity mapping unavailable");
		const node = nodes[0];
		node.setAttribute("data-thl-item-id", entry.itemId);
		node.setAttribute("tabindex", "0"); node.setAttribute("role", "button");
		node.setAttribute("aria-label", "Inspect entity " + entry.label);
	}
	return root.outerHTML;
}

/** Serialize the library's global render lifecycle; never install Mermaid callbacks. */
export async function renderProof(proof: DiagramProof, signal?: AbortSignal): Promise<RenderResult> {
	const check = () => {
		if (signal?.aborted) throw new DOMException("Diagram request canceled", "AbortError");
	};
	check();
	const mermaid = await load();
	const render = serial.then(async () => {
		check();
		await mermaid.parse(proof.source);
		check();
		const output = await mermaid.render("thl_proof_" + ++identity, proof.source);
		check();
		return { ...output, svg: bindSources(output.svg, proof) };
	});
	serial = render.then(() => undefined, () => undefined);
	return render;
}
