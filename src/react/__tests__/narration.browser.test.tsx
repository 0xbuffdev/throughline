import { afterEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { compile } from "../../domains/registry.js";
import { ThroughlinePlayer, ThroughlineScenarios } from "../index.js";
import "../../styles/throughline.css";
import { openPlayerPanel, seekFrame } from "./player-actions.js";

const trace = compile(
	'thl flow\nnode n "State" = 0\nstep "First"\n  set n = 1\n  note "Request started"\nstep "Second"\n  set n = 2\n  note "Server replied"',
);
afterEach(() => vi.unstubAllGlobals());

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
		speak: vi.fn((voice: FakeUtterance) => { active = voice; voices.push(voice); }),
		cancel: vi.fn(() => {
			if (active) active.onerror?.({ error: "canceled" });
			active = null;
		}),
		pause: vi.fn(() => { synth.paused = true; }),
		resume: vi.fn(() => { synth.paused = false; }),
	};
	vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
	vi.stubGlobal("speechSynthesis", synth);
	return { voices, synth };
}

it("does not speak without user activation, and leaves the original sonification independent", async () => {
	const speech = speechBoundary();
	const screen = await render(<ThroughlinePlayer trace={trace} narration sonification={{}} />);
	await openPlayerPanel(screen, "Player options");
	const button = screen.getByRole("button", { name: "Narrate captions" });
	await expect.element(button).toHaveAttribute("aria-pressed", "false");
	expect(speech.voices).toHaveLength(0);
	expect(screen.getByRole("button", { name: "Sonify trace" }).element()).not.toBeNull();

	await button.click();
	await expect.element(button).toHaveAttribute("aria-pressed", "true");
	expect(speech.voices).toHaveLength(1);
	expect(speech.voices[0].text).toContain(trace.frames[0].label);
	expect(speech.synth.speak).toHaveBeenCalledTimes(1);
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(speech.voices).toHaveLength(2);
	expect(speech.voices[1].text).toContain("Request started");
	await openPlayerPanel(screen, "Player options");
	await button.click();
	await expect.element(button).toHaveAttribute("aria-pressed", "false");
	expect(speech.synth.cancel).toHaveBeenCalled();
});

it("lets speech completion, rather than an interval, drive autoplay", async () => {
	const speech = speechBoundary();
	const screen = await render(<ThroughlinePlayer trace={trace} narration />);
	await openPlayerPanel(screen, "Player options");
	await screen.getByRole("button", { name: "Narrate captions" }).click();
	const play = screen.getByRole("button", { name: "Play", exact: true });
	await play.click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
	// The speech clock must hold this step even after the normal 1.5s timer.
	await new Promise((resolve) => setTimeout(resolve, 1650));
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
	speech.voices[0].onend?.();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 3");
	expect(speech.voices).toHaveLength(2);
	speech.voices[1].onend?.();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 3");
	speech.voices[2].onend?.();
	await expect.element(screen.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 3");
});

it("pauses, resumes and cancels stale callbacks when seeking", async () => {
	const speech = speechBoundary();
	const screen = await render(<ThroughlinePlayer trace={trace} narration />);
	await openPlayerPanel(screen, "Player options");
	await screen.getByRole("button", { name: "Narrate captions" }).click();
	await screen.getByRole("button", { name: "Play", exact: true }).click();
	await screen.getByRole("button", { name: "Pause" }).click();
	expect(speech.synth.pause).toHaveBeenCalled();
	await screen.getByRole("button", { name: "Play", exact: true }).click();
	expect(speech.synth.resume).toHaveBeenCalled();
	const stale = speech.voices[0].onend;
	await seekFrame(screen, 2);
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 3");
	expect(speech.voices).toHaveLength(2);
	stale?.();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 3");
});

it("disables unavailable narration and never starts speech without an offered prop", async () => {
	vi.stubGlobal("SpeechSynthesisUtterance", undefined);
	vi.stubGlobal("speechSynthesis", undefined);
	const screen = await render(<ThroughlinePlayer trace={trace} narration />);
	await openPlayerPanel(screen, "Player options");
	const narrator = screen.getByRole("button", { name: "Narrate captions" });
	await expect.element(narrator).toBeDisabled();
	await screen.rerender(<ThroughlinePlayer trace={trace} />);
	expect(screen.getByRole("button", { name: "Narrate captions" }).query()).toBeNull();
	await screen.getByRole("button", { name: "Play", exact: true }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
});

it("resets speech control and invalidates old voices on independent scenario changes", async () => {
	const speech = speechBoundary();
	const screen = await render(
		<ThroughlineScenarios
			scenarios={[
				{ id: "first", title: "First", trace },
				{ id: "second", title: "Second", trace: compile('thl flow\nnode a "A" = 0\nstep "Other"\n  set a = 1') },
			]}
			narration
		/>,
	);
	await openPlayerPanel(screen, "Player options");
	await screen.getByRole("button", { name: "Narrate captions" }).click();
	expect(speech.voices).toHaveLength(1);
	const previous = speech.voices[0].onend;
	await screen.getByRole("combobox", { name: "Scenario" }).selectOptions("second");
	await openPlayerPanel(screen, "Player options");
	await expect.element(screen.getByRole("button", { name: "Narrate captions" })).toHaveAttribute("aria-pressed", "false");
	previous?.();
	expect(speech.voices).toHaveLength(1);
	expect(speech.synth.cancel).toHaveBeenCalled();
});

it("holds the current step after a speech failure instead of treating failure as completion", async () => {
	const speech = speechBoundary();
	const screen = await render(<ThroughlinePlayer trace={trace} narration />);
	await openPlayerPanel(screen, "Player options");
	const button = screen.getByRole("button", { name: "Narrate captions" });
	await button.click();
	speech.voices[0].onerror?.({ error: "not-allowed" });
	await expect.element(screen.getByRole("alert")).toHaveTextContent("Turn narration off and on to retry.");
	await screen.getByRole("button", { name: "Play", exact: true }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
	speech.voices[0].onend?.();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
	await openPlayerPanel(screen, "Player options");
	await button.click();
	await button.click();
	expect(speech.voices).toHaveLength(2);
});

it("preserves mobile touch controls when narration and sound effects are both offered", async () => {
	const { page } = await import("vitest/browser");
	await page.viewport(320, 750);
	speechBoundary();
	const screen = await render(<ThroughlinePlayer trace={trace} narration sonification={{}} />);
	await openPlayerPanel(screen, "Player options");
	await expect.element(screen.getByRole("button", { name: "Narrate captions" })).toBeEnabled();
	const player = document.querySelector<HTMLElement>(".thl")!;
	const controls = document.querySelector<HTMLElement>(".thl-controls")!;
	const bounds = controls.getBoundingClientRect();
	expect(player.scrollWidth).toBeLessThanOrEqual(player.clientWidth);
	for (const item of controls.querySelectorAll<HTMLElement>("button, select, input")) {
		const rect = item.getBoundingClientRect();
		expect(rect.left).toBeGreaterThanOrEqual(bounds.left - 1);
		expect(rect.right).toBeLessThanOrEqual(bounds.right + 1);
	}
	expect(screen.getByRole("button", { name: "Narrate captions" }).element().getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
});

it("stops an active voice and restores the normal clock if a host removes narration", async () => {
	const speech = speechBoundary();
	const screen = await render(<ThroughlinePlayer trace={trace} narration />);
	await openPlayerPanel(screen, "Player options");
	await screen.getByRole("button", { name: "Narrate captions" }).click();
	expect(speech.voices).toHaveLength(1);
	await screen.rerender(<ThroughlinePlayer trace={trace} />);
	expect(screen.getByRole("button", { name: "Narrate captions" }).query()).toBeNull();
	expect(speech.synth.cancel).toHaveBeenCalled();
	await screen.rerender(<ThroughlinePlayer trace={trace} narration />);
	await openPlayerPanel(screen, "Player options");
	await expect.element(screen.getByRole("button", { name: "Narrate captions" })).toHaveAttribute("aria-pressed", "false");
	expect(speech.voices).toHaveLength(1);
});
