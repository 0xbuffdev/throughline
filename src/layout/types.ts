import type { ValueLayout } from "./value.js";

export type Pt = [number, number];
export type Box = Pick<ValueLayout, "w" | "h"> & { x: number; y: number };
export type Edge = { d: string; from: Pt; to: Pt; label: Pt; labelVisible?: boolean; angle: number };
export type Layout = {
	width: number;
	height: number;
	viewBox: string;
	groups: { name: string; id?: string; parentId?: string; x: number; y: number; w: number; h: number }[];
	nodes: Record<string, Box>;
	edges: Record<string, Edge>;
};
