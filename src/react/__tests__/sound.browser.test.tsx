import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { compile } from "../../domains/registry.js";
import { ThroughlinePlayer } from "../index.js";

const trace = compile(
	'```thl flow\nnode n "Number" = 0\nstep "One"\n set n = 1\nstep "Two"\n set n = 2\n```',
);
afterEach(() => vi.unstubAllGlobals());

/** Stub the audio hardware boundary; the actual React lifecycle still runs. */
function audioBoundary() {
	const voices: {
		frequency: { value: number };
		onended: (() => void) | null;
		connect: ReturnType<typeof vi.fn>;
		disconnect: ReturnType<typeof vi.fn>;
		start: ReturnType<typeof vi.fn>;
		stop: ReturnType<typeof vi.fn>;
	}[] = [];
	const gains: {
		gain: {
			setValueAtTime: ReturnType<typeof vi.fn>;
			exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
		};
		connect: ReturnType<typeof vi.fn>;
		disconnect: ReturnType<typeof vi.fn>;
	}[] = [];
	const contexts: AudioBoundary[] = [];
	class AudioBoundary {
		currentTime = 0;
		destination = {};
		resume = vi.fn().mockResolvedValue(undefined);
		close = vi.fn().mockResolvedValue(undefined);
		constructor() {
			contexts.push(this);
		}
		createOscillator() {
			const voice = {
				frequency: { value: 0 },
				onended: null as (() => void) | null,
				connect: vi.fn(),
				disconnect: vi.fn(),
				start: vi.fn(),
				stop: vi.fn((when?: number) => {
					if (when === undefined) voice.onended?.();
				}),
			};
			voices.push(voice);
			return voice;
		}
		createGain() {
			const gain = {
				gain: {
					setValueAtTime: vi.fn(),
					exponentialRampToValueAtTime: vi.fn(),
				},
				connect: vi.fn(),
				disconnect: vi.fn(),
			};
			gains.push(gain);
			return gain;
		}
	}
	vi.stubGlobal("AudioContext", AudioBoundary);
	return { voices, gains, contexts };
}

it("stops and disconnects replaced voices, and closes audio on unmount", async () => {
	const audio = audioBoundary();
	const screen = await render(
		<ThroughlinePlayer trace={trace} sonification={{ enabled: true }} />,
	);
	expect(audio.voices).toHaveLength(1);
	expect(audio.voices[0].start).toHaveBeenCalledOnce();
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(audio.voices[0].stop).toHaveBeenLastCalledWith();
	expect(audio.voices[0].disconnect).toHaveBeenCalledOnce();
	expect(audio.gains[0].disconnect).toHaveBeenCalledOnce();
	expect(audio.voices).toHaveLength(2);
	await screen.getByRole("button", { name: "Sonify trace" }).click();
	expect(audio.voices[1].stop).toHaveBeenLastCalledWith();
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(audio.voices).toHaveLength(2);
	await screen.getByRole("button", { name: "Sonify trace" }).click();
	expect(audio.voices).toHaveLength(3);
	await screen.unmount();
	expect(audio.voices[2].stop).toHaveBeenLastCalledWith();
	expect(audio.voices[2].disconnect).toHaveBeenCalledOnce();
	expect(audio.contexts[0].close).toHaveBeenCalledOnce();
});

it("opens a fresh context after StrictMode disposes the first effect", async () => {
	const audio = audioBoundary();
	const screen = await render(
		<StrictMode>
			<ThroughlinePlayer trace={trace} sonification={{ enabled: true }} />
		</StrictMode>,
	);
	expect(audio.contexts).toHaveLength(2);
	expect(audio.contexts[0].close).toHaveBeenCalledOnce();
	expect(audio.contexts[1].close).not.toHaveBeenCalled();
	await screen.unmount();
	expect(audio.contexts[1].close).toHaveBeenCalledOnce();
});

it("keeps stepping when audio is unavailable or a custom handler throws", async () => {
	vi.stubGlobal("AudioContext", undefined);
	const screen = await render(
		<ThroughlinePlayer trace={trace} sonification={{ enabled: true }} />,
	);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect
		.element(screen.getByRole("status"))
		.toHaveTextContent("Step 2 of 3");
	const onTone = vi.fn(() => {
		throw new Error("Consumer audio failed");
	});
	await screen.rerender(
		<ThroughlinePlayer
			trace={trace}
			sonification={{ enabled: true, onTone }}
		/>,
	);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect
		.element(screen.getByRole("status"))
		.toHaveTextContent("Step 3 of 3");
	expect(onTone).toHaveBeenCalled();
});

it("releases the previous voice and cues a new trace with the same frame count", async () => {
	const audio = audioBoundary();
	const replacement = compile(
		'```thl flow\nnode n "Other number" = 10\nstep "Ten"\n set n = 20\nstep "Eleven"\n set n = 21\n```',
	);
	expect(replacement.frames).toHaveLength(trace.frames.length);
	const screen = await render(
		<ThroughlinePlayer trace={trace} sonification={{ enabled: true }} />,
	);
	expect(audio.voices).toHaveLength(1);
	const first = audio.voices[0];
	expect(first.start).toHaveBeenCalledOnce();

	// A parent rerender without a trace identity change must not replay the tone.
	await screen.rerender(
		<ThroughlinePlayer trace={trace} title="Same trace" sonification={{ enabled: true }} />,
	);
	expect(audio.voices).toHaveLength(1);
	expect(first.disconnect).not.toHaveBeenCalled();

	// No step, frame-count or onTone dependency changes across this replacement.
	await screen.rerender(
		<ThroughlinePlayer trace={replacement} sonification={{ enabled: true }} />,
	);
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
	// The first stop schedules the tone end; the second cancels it on replacement.
	expect(first.stop).toHaveBeenCalledTimes(2);
	expect(first.stop).toHaveBeenNthCalledWith(2);
	expect(first.disconnect).toHaveBeenCalledOnce();
	expect(audio.gains[0].disconnect).toHaveBeenCalledOnce();
	expect(audio.voices).toHaveLength(2);
	expect(audio.voices[1].start).toHaveBeenCalledOnce();
	expect(audio.contexts).toHaveLength(1);

	// Late browser callbacks and subsequent ordinary rerenders cannot double-release.
	first.onended?.();
	expect(first.disconnect).toHaveBeenCalledOnce();
	await screen.rerender(
		<ThroughlinePlayer trace={replacement} title="Updated title" sonification={{ enabled: true }} />,
	);
	expect(audio.voices).toHaveLength(2);
	await screen.unmount();
	expect(audio.voices[1].disconnect).toHaveBeenCalledOnce();
});

it("releases an already-ended voice once even if a later stop throws", async () => {
	const audio = audioBoundary();
	const screen = await render(
		<ThroughlinePlayer trace={trace} sonification={{ enabled: true }} />,
	);
	const first = audio.voices[0];
	first.onended?.();
	expect(first.disconnect).toHaveBeenCalledOnce();
	expect(audio.gains[0].disconnect).toHaveBeenCalledOnce();
	first.stop.mockImplementationOnce(() => {
		throw new DOMException("Already ended", "InvalidStateError");
	});
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 3");
	expect(first.disconnect).toHaveBeenCalledOnce();
	expect(audio.gains[0].disconnect).toHaveBeenCalledOnce();
	await screen.unmount();
});
