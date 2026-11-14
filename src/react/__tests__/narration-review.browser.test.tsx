import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compile } from "../../domains/registry.js";
import type { ThroughlineGuidance } from "../guidance.js";
import { ThroughlinePlayer } from "../index.js";
import "../../styles/throughline.css";
import { openPlayerPanel } from "./player-actions.js";

const trace = compile(
	'thl flow\nnode a "Client" = 0\nstep "Request"\n  set a = 1\n  note "Request started"\nstep "Response"\n  set a = 2\n  note "Response received"',
);

function speechBoundary() {
	class FakeUtterance {
		rate = 1;
		onend: (() => void) | null = null;
		onerror: ((event: { error: string }) => void) | null = null;
		constructor(public text: string) {}
	}
	const voices: FakeUtterance[] = [];
	let active: FakeUtterance | null = null;
	const synth = {
		paused: false,
		speak: vi.fn((voice: FakeUtterance) => {
			active = voice;
			voices.push(voice);
		}),
		cancel: vi.fn(() => {
			const voice = active;
			active = null;
			voice?.onerror?.({ error: "interrupted" });
		}),
		pause: vi.fn(() => { synth.paused = true; }),
		resume: vi.fn(() => { synth.paused = false; }),
	};
	vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
	vi.stubGlobal("speechSynthesis", synth);
	return { voices, synth };
}
afterEach(() => vi.unstubAllGlobals());

it("reports an external interruption and pauses without completing the step", async () => {
	const speech = speechBoundary();
	const screen = await render(<ThroughlinePlayer trace={trace} narration />);
	await openPlayerPanel(screen, "Player options");
	const narrator = screen.getByRole("button", { name: "Narrate captions" });
	await narrator.click();
	await screen.getByRole("button", { name: "Play", exact: true }).click();
	const abandoned = speech.voices[0].onend;
	speech.voices[0].onerror?.({ error: "interrupted" });
	await expect.element(screen.getByRole("alert")).toHaveTextContent("Speech stopped (interrupted)");
	await expect.element(screen.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
	abandoned?.();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
	await openPlayerPanel(screen, "Player options");
	await narrator.click();
	await narrator.click();
	expect(speech.voices).toHaveLength(2);
});

it("takes over speech across two players and never cancels B when displaced A seeks or unmounts", async () => {
	const speech = speechBoundary();
	const screen = await render(
		<div>
			<ThroughlinePlayer key="a" title="First" trace={trace} narration />
			<ThroughlinePlayer key="b" title="Second" trace={trace} narration />
		</div>,
	);
	const all = [...document.querySelectorAll<HTMLElement>(".thl")];
	expect(all).toHaveLength(2);
	const a = all[0];
	const b = all[1];
	const aSound = a.querySelector<HTMLButtonElement>(".thl-narration")!;
	const bSound = b.querySelector<HTMLButtonElement>(".thl-narration")!;
	const aPlay = a.querySelector<HTMLButtonElement>(".thl-play")!;
	await userEvent.click(a.querySelector<HTMLButtonElement>(".thl-options-trigger")!);
	await userEvent.click(aSound);
	await userEvent.click(aPlay);
	expect(speech.voices).toHaveLength(1);
	const stale = speech.voices[0].onend;
	await userEvent.click(b.querySelector<HTMLButtonElement>(".thl-options-trigger")!);
	await userEvent.click(bSound);
	expect(speech.voices).toHaveLength(2);
	await expect.poll(() => aSound.getAttribute("aria-pressed")).toBe("false");
	await expect.poll(() => aPlay.getAttribute("aria-label")).toBe("Play");
	expect(a.querySelector('[role="alert"]')?.textContent).toContain("another Throughline player");
	expect(bSound.getAttribute("aria-pressed")).toBe("true");
	stale?.();
	expect(a.querySelector('[role="status"]')?.textContent).toContain("Step 1 of 3");
	const count = speech.synth.cancel.mock.calls.length;
	await userEvent.click(a.querySelector<HTMLButtonElement>('button[aria-label="Step forward"]')!);
	expect(speech.synth.cancel.mock.calls.length).toBe(count);
	expect(bSound.getAttribute("aria-pressed")).toBe("true");
	await screen.rerender(
		<div><ThroughlinePlayer key="b" title="Second" trace={trace} narration /></div>,
	);
	expect(speech.synth.cancel.mock.calls.length).toBe(count);
	expect(speech.voices).toHaveLength(2);
	expect(document.querySelector(".thl-narration")?.getAttribute("aria-pressed")).toBe("true");
});

it("preserves B's active voice when the unmounted A had already yielded ownership", async () => {
	const speech = speechBoundary();
	const screen = await render(
		<div>
			<ThroughlinePlayer key="a" title="A" trace={trace} narration />
			<ThroughlinePlayer key="b" title="B" trace={trace} narration />
		</div>,
	);
	const players = [...document.querySelectorAll<HTMLElement>(".thl")];
	for (const player of players) {
		await userEvent.click(player.querySelector<HTMLButtonElement>(".thl-options-trigger")!);
		await userEvent.click(player.querySelector<HTMLButtonElement>(".thl-narration")!);
	}
	const count = speech.synth.cancel.mock.calls.length;
	await screen.rerender(
		<div><ThroughlinePlayer key="b" title="B" trace={trace} narration /></div>,
	);
	expect(speech.synth.cancel.mock.calls.length).toBe(count);
	expect(speech.voices).toHaveLength(2);
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(speech.voices).toHaveLength(3);
});

it("replaces stale guidance on the same frame without allowing the old voice to advance", async () => {
	const speech = speechBoundary();
	const first: ThroughlineGuidance = {
		chapters: [{ id: "one", title: "Original instructions", start: 0, end: 2 }],
	};
	const updated: ThroughlineGuidance = {
		chapters: [{ id: "one", title: "Corrected instructions", start: 0, end: 2 }],
	};
	const screen = await render(<ThroughlinePlayer trace={trace} narration guidance={first} />);
	await openPlayerPanel(screen, "Player options");
	await screen.getByRole("button", { name: "Narrate captions" }).click();
	await screen.getByRole("button", { name: "Play", exact: true }).click();
	expect(speech.voices[0].text).toContain("Original instructions");
	const stale = speech.voices[0].onend;
	await screen.rerender(<ThroughlinePlayer trace={trace} narration guidance={updated} />);
	expect(speech.voices).toHaveLength(2);
	expect(speech.voices[1].text).toContain("Corrected instructions");
	expect(speech.voices[1].text).not.toContain("Original instructions");
	stale?.();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
	speech.voices[1].onend?.();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 3");
});

it("restarts same-frame narration, including after the old utterance completed", async () => {
	const speech = speechBoundary();
	const guidance: ThroughlineGuidance = {
		chapters: [{ id: "opening", title: "Opening chapter", start: 0, end: 2 }],
	};
	const screen = await render(<ThroughlinePlayer trace={trace} narration guidance={guidance} />);
	await openPlayerPanel(screen, "Player options");
	await screen.getByRole("button", { name: "Narrate captions" }).click();
	const restart = screen.getByRole("button", { name: "Restart chapter" });
	const old = speech.voices[0].onend;
	await restart.click();
	expect(speech.voices).toHaveLength(2);
	old?.();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
	speech.voices[1].onend?.();
	await restart.click();
	expect(speech.voices).toHaveLength(3);
	expect(speech.voices[2].text).toContain("Opening chapter");
});

it("keeps two audio controls within embedded content widths of 300–320px", async () => {
	await page.viewport(1100, 850);
	speechBoundary();
	const widths = [348, 356, 366, 368, 380, 420];
	const screen = await render(
		<div style={{ width: "348px" }}>
			<ThroughlinePlayer trace={trace} narration sonification={{}} />
		</div>,
	);
	for (const width of widths) {
		await screen.rerender(
			<div style={{ width: width + "px" }}>
				<ThroughlinePlayer trace={trace} narration sonification={{}} />
			</div>,
		);
		const player = document.querySelector<HTMLElement>(".thl")!;
		const controls = player.querySelector<HTMLElement>(".thl-controls")!;
		const bounds = controls.getBoundingClientRect();
		await expect.poll(() => Math.round(player.getBoundingClientRect().width)).toBe(width);
		expect(player.scrollWidth, "player at " + width).toBeLessThanOrEqual(player.clientWidth);
		for (const item of controls.querySelectorAll<HTMLElement>("button, select, input")) {
			const rect = item.getBoundingClientRect();
			expect(rect.left, "left control at " + width).toBeGreaterThanOrEqual(bounds.left - 1);
			expect(rect.right, "right control at " + width).toBeLessThanOrEqual(bounds.right + 1);
		}
		const transport = controls.querySelector(".thl-transport")!.getBoundingClientRect();
		const speed = controls.querySelector(".thl-speed-control")!.getBoundingClientRect();
		expect(Math.abs(transport.top + transport.height / 2 - speed.top - speed.height / 2)).toBeLessThan(2);
	}
});

it("keeps controls visible with neither, one, or both optional audio features at narrow embed widths", async () => {
	await page.viewport(1100, 850);
	speechBoundary();
	const configurations = [
		{ name: "no audio", narration: false, sonification: false },
		{ name: "narration only", narration: true, sonification: false },
		{ name: "sound effects only", narration: false, sonification: true },
		{ name: "both audio controls", narration: true, sonification: true },
	] as const;
	const widths = [260, 280, 296, 300, 320, 348, 368, 380, 420];
	const screen = await render(
		<div style={{ width: "320px" }}>
			<ThroughlinePlayer trace={trace} />
		</div>,
	);
	for (const configuration of configurations) {
		for (const width of widths) {
			await screen.rerender(
				<div style={{ width: width + "px" }}>
					<ThroughlinePlayer
						trace={trace}
						narration={configuration.narration}
						sonification={configuration.sonification ? {} : undefined}
					/>
				</div>,
			);
			const label = configuration.name + " at " + width + "px";
			const player = document.querySelector<HTMLElement>(".thl")!;
			const controls = player.querySelector<HTMLElement>(".thl-controls")!;
			const bounds = controls.getBoundingClientRect();
			await expect.poll(() => Math.round(player.getBoundingClientRect().width)).toBe(width);
			expect(player.scrollWidth, label).toBeLessThanOrEqual(player.clientWidth);
			for (const item of controls.querySelectorAll<HTMLElement>("button, select, input")) {
				const rect = item.getBoundingClientRect();
				expect(rect.left, label + " left").toBeGreaterThanOrEqual(bounds.left - 1);
				expect(rect.right, label + " right").toBeLessThanOrEqual(bounds.right + 1);
			}
			const transport = controls.querySelector(".thl-transport")!.getBoundingClientRect();
			const speed = controls.querySelector(".thl-speed-control")!.getBoundingClientRect();
			if (width - 48 <= 260) {
				expect(speed.top, label + " speed row").toBeGreaterThan(transport.top);
			} else {
				expect(Math.abs(transport.top + transport.height / 2 - speed.top - speed.height / 2), label).toBeLessThan(2);
			}
		}
	}
});
