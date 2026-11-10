import { describe, expect, it } from "vitest";
import { compile } from "../domains/registry.js";
import { composeTrace } from "../layout.js";
import {
	cameraViewBox,
	constrainCamera,
	fitCamera,
	focusCamera,
	MAX_ZOOM,
	panCamera,
	zoomCamera,
} from "../layout/viewport.js";

const trace = compile([
	"```thl flow",
	'node a "A" = 1',
	'node b "B" = 2',
	'link edge a -> b',
	'step "Focus B"',
	'  focus b',
	"```",
].join("\n"));

const layout = composeTrace(trace, 380);
const box = (camera: ReturnType<typeof fitCamera>) =>
	cameraViewBox(layout, camera).split(" ").map(Number);

describe("pure guided viewport math (TL-I13)", () => {
	it("starts in a finite fit-to-view overview without touching the trace", () => {
		const before = structuredClone(trace);
		const overview = fitCamera(layout);
		expect(box(overview)).toEqual([0, 0, layout.width, layout.height]);
		expect(fitCamera(layout)).toEqual(overview);
		expect(constrainCamera(layout, { zoom: Infinity, centerX: NaN, centerY: -Infinity }))
			.toEqual(overview);
		expect(trace).toEqual(before);
	});

	it("anchors zoom, keeps it bounded, and restores overview exactly", () => {
		const initial = fitCamera(layout);
		const anchor = { x: layout.width / 3, y: layout.height / 4 };
		const zoomed = zoomCamera(layout, initial, 2, anchor);
		const [x, y, width, height] = box(zoomed);
		expect(zoomed.zoom).toBe(2);
		expect((anchor.x - x) / width).toBeCloseTo(anchor.x / layout.width);
		expect((anchor.y - y) / height).toBeCloseTo(anchor.y / layout.height);
		expect(zoomCamera(layout, zoomed, 100).zoom).toBe(MAX_ZOOM);
		expect(zoomCamera(layout, zoomed, 0.000001).zoom).toBe(1);
		expect(zoomCamera(layout, zoomed, NaN)).toEqual(zoomed);
		expect(box(fitCamera(layout))).toEqual([0, 0, layout.width, layout.height]);
	});

	it("pans without leaving the entire graph offscreen or mutating geometry", () => {
		const original = structuredClone(layout);
		const camera = zoomCamera(layout, fitCamera(layout), 2);
		const shifted = panCamera(layout, camera, 30, -40);
		expect(shifted.centerX).toBeLessThan(camera.centerX);
		expect(shifted.centerY).toBeGreaterThan(camera.centerY);
		const extreme = panCamera(layout, camera, -1e8, 1e8);
		expect(Number.isFinite(extreme.centerX)).toBe(true);
		expect(Number.isFinite(extreme.centerY)).toBe(true);
		expect(extreme.centerX).toBeLessThan(layout.width);
		expect(extreme.centerY).toBeGreaterThan(0);
		expect(layout).toEqual(original);
	});

	it("centers visible entities and leaves viewport decisions separate from seek", () => {
		const overview = fitCamera(layout);
		const target = layout.nodes.b;
		const next = focusCamera(layout, zoomCamera(layout, overview, 2), target);
		const [left, top, width, height] = box(next);
		expect(target.x + target.w / 2).toBeGreaterThanOrEqual(left);
		expect(target.x + target.w / 2).toBeLessThanOrEqual(left + width);
		expect(target.y + target.h / 2).toBeGreaterThanOrEqual(top);
		expect(target.y + target.h / 2).toBeLessThanOrEqual(top + height);
		expect(focusCamera(layout, next, target)).toEqual(next);
		expect(trace.frames[0].state.active).toEqual([]);
		expect(trace.frames[1].state.active).toEqual(["b"]);
	});
});
