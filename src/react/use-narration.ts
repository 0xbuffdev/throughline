import { useCallback, useEffect, useRef, useState } from "react";
import type { Trace } from "../model.js";
import type { SeekAction, Speed } from "../seek.js";

type Session = {
	trace: Trace;
	step: number;
	utterance: SpeechSynthesisUtterance;
	ended: boolean;
	failed: boolean;
};

type NarrationInput = {
	trace: Trace;
	step: number;
	text: string;
	speed: Speed;
	playing: boolean;
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
	dispatch: (action: SeekAction) => void;
	offered: boolean;
};

function speechEngine(): SpeechSynthesis | null {
	if (typeof window === "undefined" || typeof SpeechSynthesisUtterance === "undefined") return null;
	return window.speechSynthesis ?? null;
}

/**
 * A browser-owned, opt-in speech controller. The narration clock is driven by
 * utterance completion, never a timer. Stale callbacks cannot advance a seek.
 * The toggle speaks synchronously in its click handler to satisfy browsers
 * that require a user activation for text-to-speech.
 */
export function useNarration({
	trace, step, text, speed, playing, enabled, setEnabled, dispatch, offered,
}: NarrationInput): {
	available: boolean;
	error: string | null;
	toggle: () => void;
} {
	const [available, setAvailable] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const current = useRef<Session | null>(null);
	const latest = useRef({ trace, step, text, speed, playing, enabled, dispatch });
	latest.current = { trace, step, text, speed, playing, enabled, dispatch };
	const previous = useRef({ trace, step, playing, enabled });

	const stop = useCallback(() => {
		const voice = current.current;
		current.current = null;
		if (!voice) return;
		// A browser cancellation may synchronously invoke onerror/onend.
		voice.utterance.onend = null;
		voice.utterance.onerror = null;
		try { speechEngine()?.cancel(); } catch { /* Speech is optional. */ }
	}, []);

	const start = useCallback(() => {
		const engine = speechEngine();
		if (!engine) {
			setError("Caption narration is unavailable in this browser.");
			latest.current.dispatch({ type: "pause" });
			return;
		}
		stop();
		const state = latest.current;
		if (!state.text) return;
		try {
			const utterance = new SpeechSynthesisUtterance(state.text);
			utterance.rate = state.speed;
			const session: Session = {
				trace: state.trace, step: state.step, utterance, ended: false, failed: false,
			};
			current.current = session;
			utterance.onend = () => {
				if (current.current !== session || session.failed) return;
				session.ended = true;
				const next = latest.current;
				if (next.enabled && next.trace === session.trace &&
					next.step === session.step && next.playing) {
					next.dispatch({ type: "tick" });
				}
			};
			utterance.onerror = (event) => {
				if (current.current !== session) return;
				session.ended = true;
				session.failed = true;
				if (event.error === "canceled" || event.error === "interrupted") return;
				setError("Speech could not play (" + event.error + "). Turn narration off and on to retry.");
				latest.current.dispatch({ type: "pause" });
			};
			setError(null);
			// Cancelled or previously paused speech must not leave a new voice
			// stuck in the browser-wide synthesis queue.
			if (engine.paused) engine.resume();
			engine.speak(utterance);
		} catch {
			stop();
			setError("Speech synthesis failed. Narration stopped without advancing the timeline.");
			latest.current.dispatch({ type: "pause" });
		}
	}, [stop]);

	useEffect(() => {
		setAvailable(offered && Boolean(speechEngine()));
	}, [offered, setEnabled]);

	// Frame replacement or manual seeking begins the new authored caption.
	// A paused player may still narrate a step without automatic advancement.
	useEffect(() => {
		if (!enabled || !offered) { stop(); return; }
		const voice = current.current;
		if (!voice || voice.trace !== trace || voice.step !== step) start();
	}, [enabled, offered, trace, step, start, stop]);

	// Play/Pause acts on the voice, not an independent timer. Do not
	// immediately pause a voice that was just started by a manual seek.
	useEffect(() => {
		const old = previous.current;
		previous.current = { trace, step, playing, enabled };
		if (!enabled || old.trace !== trace || old.step !== step ||
			old.enabled !== enabled || old.playing === playing) return;
		const voice = current.current;
		const engine = speechEngine();
		if (!voice || !engine) return;
		if (!playing && !voice.ended) {
			try { engine.pause(); } catch { /* Preserve player transport. */ }
		} else if (playing) {
			if (voice.failed) {
				dispatch({ type: "pause" });
			} else if (voice.ended) {
				dispatch({ type: "tick" });
			} else {
				try { engine.resume(); } catch {
					setError("Speech could not resume.");
					dispatch({ type: "pause" });
				}
			}
		}
	}, [trace, step, playing, enabled, dispatch]);

	// Stop our owned utterance on unmount or independent scenario replacement.
	useEffect(() => () => stop(), [stop]);

	const toggle = useCallback(() => {
		if (latest.current.enabled) {
			stop();
			setError(null);
			setEnabled(false);
		} else if (speechEngine()) {
			setEnabled(true);
			start();
		} else {
			setError("Caption narration is unavailable in this browser.");
		}
	}, [setEnabled, start, stop]);

	return { available, error, toggle };
}
