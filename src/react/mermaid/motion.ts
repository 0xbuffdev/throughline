import type { DiagramProof } from "./adapter.js";

const ns = "http://www.w3.org/2000/svg";
let revision = 0;

/** One forward instructional cue, using geometry already produced by Mermaid.
 * This does not schedule frames, reconstruct routes, or infer physical time.
 */
export function animateTransfers(host: HTMLElement, proof: DiagramProof, durationMs: number,
	forward: boolean, reducedMotion: boolean): () => void {
	const owned: Element[] = [];
	const labels: Element[] = [];
	const cancel = () => {
		owned.forEach(node => node.remove());
		labels.forEach(node => node.removeAttribute("data-thl-label-in-motion"));
	};
	if (!forward || reducedMotion || !Number.isFinite(durationMs)) return cancel;
	const duration = Math.max(80, Math.min(1500, durationMs));
	const entries = new Map(proof.elements.filter(entry => entry.current &&
		(proof.kind === "graph" ? entry.role === "relation" : entry.sent)).map(entry => [entry.itemId, entry]));
	for (const route of host.querySelectorAll<SVGGeometryElement>("[data-thl-motion-item]")) {
		const entry = entries.get(route.getAttribute("data-thl-motion-item")!);
		if (!entry || !route.parentElement || typeof route.getTotalLength !== "function") continue;
		const length = route.getTotalLength();
		if (!Number.isFinite(length) || length <= 0) continue;
		const path = document.createElementNS(ns, "path");
		const id = "thl_motion_" + ++revision;
		path.id = id;
		if (route.tagName.toLowerCase() === "path") path.setAttribute("d", route.getAttribute("d")!);
		else {
			const start = route.getPointAtLength(0), end = route.getPointAtLength(length);
			path.setAttribute("d", "M " + start.x + " " + start.y + " L " + end.x + " " + end.y);
		}
		const definitions = document.createElementNS(ns, "defs"); definitions.append(path);
		const cue = document.createElementNS(ns, "g");
		cue.setAttribute("data-thl-transfer", entry.itemId); cue.setAttribute("aria-hidden", "true");
		if (route.hasAttribute("transform")) cue.setAttribute("transform", route.getAttribute("transform")!);
		const head = document.createElementNS(ns, "g"), triangle = document.createElementNS(ns, "polygon");
		triangle.setAttribute("points", "7,0 -4,-4 -4,4");
		triangle.setAttribute("fill", "var(--thl-active, #2563eb)"); head.append(triangle);
		const caption = document.createElementNS(ns, "g"), text = document.createElementNS(ns, "text");
		text.textContent = [...(entry.flowLabel ?? entry.label)].slice(0, 42).join("");
		text.setAttribute("y", "-13"); text.setAttribute("text-anchor", "middle");
		text.setAttribute("style", "font:12px Arial,sans-serif;fill:var(--thl-active,#1d4ed8);stroke:var(--thl-bg,white);stroke-width:3px;paint-order:stroke");
		caption.append(text);
		for (const [element, rotate] of [[head, "auto"], [caption, "0"]] as const) {
			if (element === caption && !text.textContent) continue;
			const animation = document.createElementNS(ns, "animateMotion");
			animation.setAttribute("dur", duration / 1000 + "s"); animation.setAttribute("repeatCount", "1");
			animation.setAttribute("rotate", rotate); animation.setAttribute("fill", "freeze");
			animation.setAttribute("begin", "indefinite");
			const reference = document.createElementNS(ns, "mpath"); reference.setAttribute("href", "#" + id);
			animation.append(reference); element.append(animation); cue.append(element);
		}
		route.parentElement.append(definitions, cue); owned.push(definitions, cue);
		for (const label of host.querySelectorAll('[data-thl-motion-label="' + entry.itemId + '"]')) {
			label.setAttribute("data-thl-label-in-motion", "");
			labels.push(label);
		}
		for (const animation of cue.querySelectorAll("animateMotion")) animation.beginElement();
	}
	const timer = window.setTimeout(cancel, duration + 80);
	return () => { window.clearTimeout(timer); cancel(); };
}
