import type { Box, Layout } from "../layout/types.js";
import type { Camera, Point } from "../layout/viewport.js";

export type ViewportSize = { width: number; height: number };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Zoom is actual display scale, so dense worlds can still reach readable text. */
export function fitScale(world: Layout, size: ViewportSize): number {
	return Math.min(1, size.width / Math.max(1, world.width), size.height / Math.max(1, world.height));
}
export function constrainCamera(world: Layout, size: ViewportSize, camera: Camera): Camera {
	return { zoom: clamp(Number.isFinite(camera.zoom) ? camera.zoom : 1, fitScale(world, size), 4),
		centerX: clamp(Number.isFinite(camera.centerX) ? camera.centerX : world.width / 2, 0, world.width),
		centerY: clamp(Number.isFinite(camera.centerY) ? camera.centerY : world.height / 2, 0, world.height) };
}
export function fitCamera(world: Layout, size: ViewportSize): Camera {
	return { centerX: world.width / 2, centerY: world.height / 2, zoom: fitScale(world, size) };
}
export function initialCamera(world: Layout, size: ViewportSize): Camera {
	return { centerX: world.width / 2, centerY: Math.min(world.height / 2, size.height / 2), zoom: 1 };
}
export function cameraViewBox(world: Layout, size: ViewportSize, camera: Camera): string {
	const c = constrainCamera(world, size, camera);
	const width = size.width / c.zoom, height = size.height / c.zoom;
	return `${c.centerX - width / 2} ${c.centerY - height / 2} ${width} ${height}`;
}
export function panCamera(world: Layout, size: ViewportSize, camera: Camera, dx: number, dy: number): Camera {
	return constrainCamera(world, size, { ...camera, centerX: camera.centerX - dx, centerY: camera.centerY - dy });
}
export function zoomCamera(world: Layout, size: ViewportSize, camera: Camera, factor: number,
	anchor: Point = { x: camera.centerX, y: camera.centerY }): Camera {
	if (!Number.isFinite(factor) || factor <= 0) return constrainCamera(world, size, camera);
	const zoom = clamp(camera.zoom * factor, fitScale(world, size), 4);
	const ratio = camera.zoom / zoom;
	return constrainCamera(world, size, { zoom, centerX: anchor.x + (camera.centerX - anchor.x) * ratio,
		centerY: anchor.y + (camera.centerY - anchor.y) * ratio });
}
export function focusCamera(world: Layout, size: ViewportSize, camera: Camera, bounds: Box): Camera {
	return constrainCamera(world, size, { centerX: bounds.x + bounds.w / 2, centerY: bounds.y + bounds.h / 2,
		zoom: Math.min(camera.zoom, .85 * Math.min(size.width / Math.max(1, bounds.w + 12), size.height / Math.max(1, bounds.h + 12))) });
}
