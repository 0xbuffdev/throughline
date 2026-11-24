import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { VisualArtifact } from "../../v2/model.js";
import { compileArtifact } from "../../v2/compiler.js";
import { ThroughlineGraphPlayer } from "../graph-player.js";
import "../../styles/throughline.css";

function source(): VisualArtifact {
	return {
		schemaVersion: 2, id: "lanes", origins: [{ id: "author", kind: "authored" }],
		entities: ["a", "b", "c"].map(id => ({ id, label: id.toUpperCase() })),
		relations: [{ id: "ab", from: "a", to: "b" }, { id: "bc", from: "b", to: "c" },
			{ id: "ca", from: "c", to: "a" }, { id: "self", from: "b", to: "b" }],
		initialState: { a: { status: "known", value: null }, b: { status: "unknown" }, c: { status: "known", value: 1 } },
		steps: [
			{ id: "one", label: "First send", events: [{ id: "send1", originId: "author", type: "message", relationId: "ab", messageId: "first", phase: "sent" }] },
			{ id: "two", label: "Second send", events: [{ id: "send2", originId: "author", type: "message", relationId: "bc", messageId: "second", phase: "sent" }] },
			{ id: "three", label: "Receipt only", events: [{ id: "receipt", originId: "author", type: "message", relationId: "ca", messageId: "third", phase: "received" }] },
			{ id: "four", label: "Reverse send", events: [{ id: "reverse", originId: "author", type: "message", relationId: "ca", messageId: "fourth", phase: "sent" }] },
			{ id: "five", label: "Self send", events: [{ id: "loop", originId: "author", type: "message", relationId: "self", messageId: "fifth", phase: "sent" }] },
		], views: [{ kind: "sequence", priority: 0 }],
	};
}

it("reserves all lanes from the initial frame and aligns sends with their endpoints", async () => {
	await page.viewport(1200, 900);
	const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(source())}/>);
	const shell = screen.getByRole("group", { name: "Visualization player" }).element();
	for (const width of [900, 375, 260]) {
		shell.style.width = width + "px";
		shell.focus(); await userEvent.keyboard("{Home}");
		await expect.poll(() => Math.round(shell.getBoundingClientRect().width)).toBe(width);
		const centers = () => [...shell.querySelectorAll(".lifelines i")].map(node => {
			const r = node.getBoundingClientRect(); return r.x + r.width / 2;
		});
		expect(centers()).toHaveLength(3);
		const initial = centers();
		expect(shell.querySelectorAll(".sequence-list li")).toHaveLength(0);
		for (let frame = 1; frame <= 5; frame++) {
			await screen.getByRole("button", { name: "Step forward" }).click();
			expect(centers()).toEqual(initial);
		}
		for (const [event, from, to] of [["send1", 0, 1], ["send2", 1, 2], ["reverse", 2, 0]] as const) {
			const line = shell.querySelector(`.sequence-list [data-source-event-ids="${event}"] .seq-line`)!;
			const r = line.getBoundingClientRect();
			expect(Math.abs(r.left - initial[Math.min(from, to)])).toBeLessThan(1);
			expect(Math.abs(r.right - initial[Math.max(from, to)])).toBeLessThan(1);
			expect(line.parentElement?.classList.contains(from > to ? "left" : "right")).toBe(true);
		}
		expect(shell.querySelector('.sequence-list [data-source-event-ids="receipt"] .seq-arrow')).toBeNull();
		expect(shell.querySelector('.sequence-list [data-source-event-ids="receipt"] .seq-phase')?.textContent).toBe("received");
		expect(shell.querySelector('.sequence-list [data-source-event-ids="loop"]')?.classList.contains("self")).toBe(true);
		expect(shell.scrollWidth).toBeLessThanOrEqual(shell.clientWidth + 1);
	}
});

it("animates a forward send but settles seek, rewind and view changes", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(source())}/>);
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(document.querySelectorAll(".seq-animate")).toHaveLength(1);
	expect(screen.getByRole("slider").query()).toBeNull();
	await screen.getByRole("button", { name: "Player options", exact: true }).click();
	const options = screen.getByRole("dialog", { name: "Player options" });
	await options.getByRole("spinbutton", { name: "Go to step" }).fill("3");
	await options.getByRole("button", { name: "Go", exact: true }).click();
	expect(document.querySelectorAll(".seq-animate")).toHaveLength(0);
	await screen.getByRole("button", { name: "Step back" }).click();
	expect(document.querySelectorAll(".seq-animate")).toHaveLength(0);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await screen.getByRole("tab", { name: "State", exact: true }).click();
	await screen.getByRole("tab", { name: "Sequence", exact: true }).click();
	expect(document.querySelectorAll(".seq-animate")).toHaveLength(0);
});

it("provides actual state-table associations and an optional title", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(source())}/>);
	expect(screen.getByRole("heading", { name: "Throughline", exact: true }).query()).toBeNull();
	await screen.getByRole("tab", { name: "State", exact: true }).click();
	const state = screen.getByRole("table", { name: "Modeled state at @initial" });
	await expect.element(state).toBeVisible();
	for (const name of ["Entity", "Presence", "Modeled cell value", "Last write"])
		await expect.element(state.getByRole("columnheader", { name, exact: true })).toBeVisible();
	await expect.element(state.getByRole("rowheader", { name: "B", exact: true })).toBeVisible();
	await expect.element(state.getByRole("cell", { name: "Unknown", exact: true })).toBeVisible();
	await expect.element(state.getByRole("cell", { name: "Known: null", exact: true })).toBeVisible();
	await screen.getByRole("button", { name: "Step forward" }).click();
	const evidence = screen.getByRole("table", { name: "Current frame event evidence" });
	await expect.element(evidence).toBeVisible();
	for (const name of ["Event", "Declared origin", "Source evidence"])
		await expect.element(evidence.getByRole("columnheader", { name, exact: true })).toBeVisible();
	await expect.element(evidence.getByRole("rowheader", { name: "Inspect event sent · send1", exact: true })).toBeVisible();
});
