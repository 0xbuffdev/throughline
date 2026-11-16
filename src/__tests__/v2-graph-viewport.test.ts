import { expect, it } from "vitest";
import { cameraViewBox, fitCamera, focusCamera, initialCamera, zoomCamera } from "../v2/graph-viewport.js";
import type { Layout } from "../layout/types.js";

const world: Layout = { width: 260, height: 12000, viewBox: "0 0 260 12000", nodes: {}, groups: [], edges: {} };
const viewport = { width: 260, height: 520 };

it("keeps dense scenes readable and allows a full overview without losing zoom recovery", () => {
	const initial = initialCamera(world, viewport);
	expect(initial.zoom).toBe(1);
	expect(cameraViewBox(world, viewport, initial)).toBe("0 0 260 520");
	const fit = fitCamera(world, viewport);
	expect(fit.zoom).toBeLessThan(.05);
	const recovered = zoomCamera(world, viewport, fit, 1 / fit.zoom);
	expect(recovered.zoom).toBe(1);
	const focused = focusCamera(world, viewport, initial, { x: 50, y: 11500, w: 100, h: 52 });
	expect(focused.centerY).toBe(11526);
	expect(focused.zoom).toBe(1);
});

it("keeps a cursor anchor stationary and centers sparse content at natural scale", () => {
	const sparse = { ...world, height: 100 };
	const initial = initialCamera(sparse, viewport);
	expect(initial.centerY).toBe(50);
	const anchor = { x: 40, y: 20 };
	const zoomed = zoomCamera(sparse, viewport, initial, 2, anchor);
	expect((anchor.x - zoomed.centerX) * zoomed.zoom).toBe((anchor.x - initial.centerX) * initial.zoom);
	expect((anchor.y - zoomed.centerY) * zoomed.zoom).toBe((anchor.y - initial.centerY) * initial.zoom);
});
