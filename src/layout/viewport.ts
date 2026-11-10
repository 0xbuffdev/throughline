import type { Box, Layout } from "./types.js";

/** Presentation-only camera. No coordinates are written into compiled traces. */
export type Camera = {
	zoom: number;
	centerX: number;
	centerY: number;
};

export type Point = { x: number; y: number };
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

export function fitCamera(layout: Layout): Camera {
	return { zoom: 1, centerX: layout.width / 2, centerY: layout.height / 2 };
}

/**
 * Keep the center inside the scene's world bounds. Even at an extreme,
 * at least half of the viewport overlaps the world. This intentionally
 * permits centering entities near every edge at overview zoom.
 */
export function constrainCamera(layout: Layout, camera: Camera): Camera {
	const zoom = clamp(Number.isFinite(camera.zoom) ? camera.zoom : 1, MIN_ZOOM, MAX_ZOOM);
	return {
		zoom,
		centerX: clamp(
			Number.isFinite(camera.centerX) ? camera.centerX : layout.width / 2,
			0,
			layout.width,
		),
		centerY: clamp(
			Number.isFinite(camera.centerY) ? camera.centerY : layout.height / 2,
			0,
			layout.height,
		),
	};
}

export function cameraViewBox(layout: Layout, camera: Camera): string {
	const current = constrainCamera(layout, camera);
	const width = layout.width / current.zoom;
	const height = layout.height / current.zoom;
	return `${current.centerX - width / 2} ${current.centerY - height / 2} ${width} ${height}`;
}

/** Positive deltas are pointer motion in world units: the content follows the drag. */
export function panCamera(layout: Layout, camera: Camera, dx: number, dy: number): Camera {
	return constrainCamera(layout, {
		...camera,
		centerX: camera.centerX - dx,
		centerY: camera.centerY - dy,
	});
}

/** Keep the world point under the cursor/fingers stationary while zooming. */
export function zoomCamera(
	layout: Layout,
	camera: Camera,
	factor: number,
	anchor: Point = { x: camera.centerX, y: camera.centerY },
): Camera {
	if (!Number.isFinite(factor) || factor <= 0) return constrainCamera(layout, camera);
	const zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
	const ratio = camera.zoom / zoom;
	return constrainCamera(layout, {
		zoom,
		centerX: anchor.x + (camera.centerX - anchor.x) * ratio,
		centerY: anchor.y + (camera.centerY - anchor.y) * ratio,
	});
}

export function focusCamera(layout: Layout, camera: Camera, node: Box): Camera {
	return constrainCamera(layout, {
		zoom: camera.zoom,
		centerX: node.x + node.w / 2,
		centerY: node.y + node.h / 2,
	});
}
