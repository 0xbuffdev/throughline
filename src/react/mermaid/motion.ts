import type { DiagramProof } from "./adapter.js";

const ns = "http://www.w3.org/2000/svg";
let revision = 0;

function routeText(label: string): SVGTextElement {
	const text = document.createElementNS(ns, "text");
	const chars = [...label];
	text.textContent = chars.length > 42 ? chars.slice(0, 41).join("") + "…" : label;
	text.setAttribute("text-anchor", "middle");
	text.setAttribute("class", "thl-route-caption");
	return text;
}

function placeGraphCaption(route: SVGGeometryElement, caption: SVGTextElement, occupied: DOMRect[]): void {
	const length = route.getTotalLength();
	const matrix = route.getScreenCTM();
	caption.setAttribute("visibility", "hidden");
	if (!matrix || !length) return;
	const width = (caption.getComputedTextLength() + 8) * matrix.a;
	const height = 16 * matrix.d;
	for (const fraction of [0.5, 0.35, 0.65, 0.2, 0.8]) {
		const point = route.getPointAtLength(length * fraction);
		for (const offset of [-10, 19, -22]) {
			const baseline = new DOMPoint(point.x, point.y + offset).matrixTransform(matrix);
			const left = baseline.x - width / 2, top = baseline.y - height + 3;
			if (occupied.some(box => left < box.right && left + width > box.left &&
				top < box.bottom && top + height > box.top)) continue;
			caption.setAttribute("x", String(point.x));
			caption.setAttribute("y", String(point.y + offset));
			caption.removeAttribute("visibility");
			occupied.push(new DOMRect(left, top, width, height));
			return;
		}
	}
}

/** Paint bounded state in the reserved node line without rebuilding geometry. */
export function paintGraphState(host: HTMLElement, proof: DiagramProof): void {
	if (proof.kind !== "graph") return;
	const elements = new Map(proof.elements.map(entry => [entry.itemId, entry]));
	for (const label of host.querySelectorAll("[data-thl-state-label]")) {
		const entry = elements.get(label.getAttribute("data-thl-state-label")!);
		if (!entry) continue;
		const text = entry.stateText ?? "Unavailable";
		if (label.textContent !== text) label.textContent = text;
		label.setAttribute("aria-label", text);
		label.setAttribute("title", text);
		const node = label.closest("[data-thl-item-id]");
		node?.toggleAttribute("data-thl-focused", entry.focused === true);
		node?.toggleAttribute("data-thl-written", entry.written === true);
	}
}

export function paintRoutes(host: HTMLElement, proof: DiagramProof, selectedId: string | null): () => void {
	paintGraphState(host, proof);
	const elements = new Map(proof.elements.map(entry => [entry.itemId, entry]));
	const sources = new Set<string>(), destinations = new Set<string>();
	const visitedNodes = new Set<string>();
	const owned: SVGTextElement[] = [];
	let occupied: DOMRect[] | undefined;
	for (const route of host.querySelectorAll<SVGGeometryElement>("[data-thl-motion-item]")) {
		const itemId = route.getAttribute("data-thl-motion-item")!;
		const entry = elements.get(itemId);
		route.toggleAttribute("data-thl-active", entry?.current === true);
		route.toggleAttribute("data-thl-route-context", entry?.context === true);
		route.toggleAttribute("data-thl-visited", entry?.visited === true);
		if (entry?.visited) {
			if (entry.fromItemId) visitedNodes.add(entry.fromItemId);
			if (entry.toItemId) visitedNodes.add(entry.toItemId);
		}
		if (!entry || (!entry.current && !entry.context)) continue;
		if (entry.fromItemId) sources.add(entry.fromItemId);
		if (entry.toItemId) destinations.add(entry.toItemId);
		if (proof.kind !== "graph" || !entry.flowLabel) continue;
		occupied ??= [...host.querySelectorAll(".node[data-thl-item-id], .cluster-label")]
			.map(node => node.getBoundingClientRect());
		const text = routeText(entry.flowLabel);
		text.setAttribute("data-thl-motion-label", itemId);
		text.setAttribute("aria-hidden", "true");
		if (route.hasAttribute("transform")) text.setAttribute("transform", route.getAttribute("transform")!);
		route.parentElement?.append(text);
		placeGraphCaption(route, text, occupied);
		owned.push(text);
	}
	for (const node of host.querySelectorAll("[data-thl-item-id]")) {
		const id = node.getAttribute("data-thl-item-id")!;
		const entry = elements.get(id);
		node.toggleAttribute("data-thl-selected", entry?.role === "entity" &&
			entry.source.entityIds?.includes(selectedId ?? "") === true);
		node.toggleAttribute("data-thl-source", sources.has(id));
		node.toggleAttribute("data-thl-destination", destinations.has(id));
		if (entry?.role === "entity" || entry?.role === "group") {
			node.toggleAttribute("data-thl-visited", visitedNodes.has(id));
		}
	}
	for (const node of host.querySelectorAll("[data-thl-phase-item], [data-thl-motion-label]")) {
		const id = node.getAttribute("data-thl-phase-item") ?? node.getAttribute("data-thl-motion-label")!;
		node.toggleAttribute("data-thl-active", elements.get(id)?.current === true);
		node.toggleAttribute("data-thl-route-context", elements.get(id)?.context === true);
		node.toggleAttribute("data-thl-visited", elements.get(id)?.visited === true);
	}
	return () => owned.forEach(node => node.remove());
}

/** One forward instructional cue, using geometry already produced by Mermaid.
 * This does not schedule frames, reconstruct routes, or infer physical time.
 */
export function animateTransfers(host: HTMLElement, proof: DiagramProof, durationMs: number,
	forward: boolean, reducedMotion: boolean, follow?: { scroller: HTMLElement; itemId: string }): () => void {
	const owned: Element[] = [];
	const labels: Element[] = [];
	const destinations = new Set<Element>();
	const routes: Element[] = [];
	let scrollFrame = 0;
	let finishScroll: (() => void) | undefined;
	const cancel = () => {
		window.cancelAnimationFrame(scrollFrame);
		owned.forEach(node => node.remove());
		labels.forEach(node => node.removeAttribute("data-thl-label-in-motion"));
		destinations.forEach(node => node.removeAttribute("data-thl-cue-running"));
		routes.forEach(node => node.removeAttribute("data-thl-route-in-motion"));
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
		const caption = document.createElementNS(ns, "g"), text = routeText(entry.flowLabel ?? entry.label);
		text.setAttribute("y", "-13");
		caption.append(text);
		for (const [element, rotate] of [[head, "auto"], [caption, "0"]] as const) {
			// Sequence captions carry the authoritative selectable row reference.
			// Keep them stationary and visible; a moving duplicate obscures them.
			if (element === caption && (proof.kind === "sequence" || !text.textContent)) continue;
			const animation = document.createElementNS(ns, "animateMotion");
			animation.setAttribute("dur", duration / 1000 + "s"); animation.setAttribute("repeatCount", "1");
			animation.setAttribute("rotate", rotate); animation.setAttribute("fill", "freeze");
			animation.setAttribute("begin", "indefinite");
			const reference = document.createElementNS(ns, "mpath"); reference.setAttribute("href", "#" + id);
			animation.append(reference); element.append(animation); cue.append(element);
		}
		const parent = route.parentElement;
		const header = parent.querySelector(":scope > [data-thl-sequence-header]");
		parent.insertBefore(definitions, header);
		parent.insertBefore(cue, header);
		owned.push(definitions, cue);
		route.setAttribute("data-thl-route-in-motion", "");
		routes.push(route);
		const destination = host.querySelector('[data-thl-item-id="' + entry.toItemId + '"]');
		if (destination) {
			destination.setAttribute("data-thl-cue-running", "");
			destinations.add(destination);
		}
		if (proof.kind === "graph") for (const label of host.querySelectorAll('[data-thl-motion-label="' + entry.itemId + '"]')) {
			label.setAttribute("data-thl-label-in-motion", "");
			labels.push(label);
		}
		for (const animation of cue.querySelectorAll("animateMotion")) animation.beginElement();
		if (follow?.itemId === entry.itemId && route.getBoundingClientRect().width > follow.scroller.clientWidth - 32) {
			const { scroller } = follow;
			const keepVisible = (start: number, end: number, margin: number) => {
				const left = scroller.getBoundingClientRect().left + margin;
				const right = left + scroller.clientWidth - margin * 2;
				if (start < left) scroller.scrollLeft += start - left;
				else if (end > right) scroller.scrollLeft += end - right;
			};
			const keepArrowVisible = () => {
				const x = head.getScreenCTM()?.e;
				if (x === undefined) return;
				keepVisible(x, x, 48);
				scrollFrame = window.requestAnimationFrame(keepArrowVisible);
			};
			finishScroll = () => {
				const bounds = destination?.getBoundingClientRect();
				if (bounds) keepVisible(bounds.left, bounds.right, 12);
			};
			scrollFrame = window.requestAnimationFrame(keepArrowVisible);
		}
	}
	const timer = window.setTimeout(() => { finishScroll?.(); cancel(); }, duration);
	return () => { window.clearTimeout(timer); cancel(); };
}
