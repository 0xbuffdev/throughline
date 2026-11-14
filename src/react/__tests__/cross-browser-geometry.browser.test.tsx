import { expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compile } from "../../domains/registry.js";
import { CHECKOUT_GUIDANCE, CHECKOUT_SCENARIOS } from "../../examples.js";
import { ThroughlinePlayer } from "../index.js";
import "../../styles/throughline.css";

/**
 * Complement the compact-height assertion: browser-native select metrics
 * differ, but controls must remain visible, non-overlapping and inside the
 * player's own bounds. Keep the original size regression check unchanged.
 */
it("keeps all desktop, tablet and phone toolbar controls inside their bounds without overlap", async () => {
	const trace = compile(CHECKOUT_SCENARIOS[2].source);
	await page.viewport(1600, 900);
	await render(<ThroughlinePlayer trace={trace} guidance={CHECKOUT_GUIDANCE} />);
	const player = document.querySelector<HTMLElement>(".thl")!;
	const controls = () => [...player.querySelectorAll<HTMLElement>(
		".thl-header > button, .thl-chapter-nav :is(button, select), .thl-viewport-tools button, .thl-bottom :is(button, select)",
	)];

	for (const [width, height] of [[1600, 900], [960, 850], [375, 850], [320, 750]] as const) {
		await page.viewport(width, height);
		await expect.poll(() => Math.round(document.documentElement.clientWidth)).toBe(width);
		await expect.poll(() => player.scrollWidth <= player.clientWidth).toBe(true);

		const boundary = player.getBoundingClientRect();
		const interactive = controls();
		expect(interactive.length).toBeGreaterThan(8);
		const rects = interactive.map((element) => ({
			name: element.getAttribute("aria-label") ?? element.tagName.toLowerCase(),
			rect: element.getBoundingClientRect(),
		}));
		for (const { name, rect } of rects) {
			expect(rect.width, name + " has no width").toBeGreaterThan(0);
			expect(rect.height, name + " has no height").toBeGreaterThan(0);
			expect(rect.left, name + " escapes left boundary").toBeGreaterThanOrEqual(boundary.left - 1);
			expect(rect.right, name + " escapes right boundary").toBeLessThanOrEqual(boundary.right + 1);
			expect(rect.top, name + " escapes top boundary").toBeGreaterThanOrEqual(boundary.top - 1);
			expect(rect.bottom, name + " escapes bottom boundary").toBeLessThanOrEqual(boundary.bottom + 1);
		}
		for (let left = 0; left < rects.length; left++) {
			for (let right = left + 1; right < rects.length; right++) {
				const a = rects[left].rect;
				const b = rects[right].rect;
				const horizontal = Math.min(a.right, b.right) - Math.max(a.left, b.left);
				const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
				expect(
					horizontal > 1 && vertical > 1,
					width + "px: " + rects[left].name + " overlaps " + rects[right].name,
				).toBe(false);
			}
		}
	}
});
