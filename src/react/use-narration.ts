import { useCallback, useEffect, useRef, useState } from "react";
import type { Trace } from "../model.js";
import type { SeekAction, Speed } from "../seek.js";
import {
	acquireSpeech,
	cancelOwnedSpeech,
	ownsSpeech,
	releaseSpeech,
	type SpeechOwner,
} from "./speech-owner.js";

type Session = {
	trace: Trace;
	step: number;
	text: string;
	seekRevision: number;
	utterance: SpeechSynthesisUtterance;
	engine: SpeechSynthesis;
	owner: SpeechOwner;
	ended: boolean;
	failed: boolean;
};

type NarrationInput = {
	trace: Trace;
	step: number;
	text: string;
	seekRevision: number;
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
 * React-only speech clock. Authored-frame identity, text and explicit seek
 * generations invalidate old utterances. Only a completed current utterance
 * may dispatch a tick. This controller does not expose speech to the core.
 */
export function useNarration({
	trace, step, text, seekRevision, speed, playing, enabled,
	setEnabled, dispatch, offered,
}: NarrationInput): {
	available: boolean;
	error: string | null;
	toggle: () => void;
} {
	const [available, setAvailable] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const current = useRef<Session | null>(null);
	const latest = useRef({
		trace, step, text, seekRevision, speed, playing, enabled, dispatch, setEnabled,
	});
	latest.current = {
		trace, step, text, seekRevision, speed, playing, enabled, dispatch, setEnabled,
	};
	const previous = useRef({ trace, step, text, seekRevision, playing, enabled });

	const stop = useCallback(() => {
		const voice = current.current;
		current.current = null;
		if (!voice) return;
		// Own cancellations are silent: detach handlers before calling the
		// global API, which may synchronously report "interrupted".
		voice.utterance.onend = null;
		voice.utterance.onerror = null;
		cancelOwnedSpeech(voice.engine, voice.owner);
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
				trace: state.trace, step: state.step, text: state.text,
				seekRevision: state.seekRevision, utterance, engine,
				owner: {
					onDisplaced: () => {
						if (current.current !== session) return;
						// Acquiring another player's voice has already removed
						// our ownership. Do NOT cancel() here.
						current.current = null;
						utterance.onend = null;
						utterance.onerror = null;
						session.failed = true;
						setError("Narration paused: another Throughline player began speaking. Enable narration again to take over.");
						latest.current.setEnabled(false);
						latest.current.dispatch({ type: "pause" });
					},
				},
				ended: false, failed: false,
			};
			acquireSpeech(engine, session.owner);
			current.current = session;
			utterance.onend = () => {
				if (current.current !== session || session.failed ||
					!ownsSpeech(session.engine, session.owner)) return;
				session.ended = true;
				releaseSpeech(session.engine, session.owner);
				const next = latest.current;
				// Updated guidance and same-step seeks invalidate an old
				// callback even before React has run its effect cleanup.
				if (next.enabled && next.trace === session.trace &&
					next.step === session.step && next.text === session.text &&
					next.seekRevision === session.seekRevision && next.playing) {
					next.dispatch({ type: "tick" });
				}
			};
			utterance.onerror = (event) => {
				if (current.current !== session || session.failed) return;
				// An event that reaches this handler is never our own cancel:
				// the owned cancellation removed the handlers first.
				session.ended = true;
				session.failed = true;
				releaseSpeech(session.engine, session.owner);
				setError(
					"Speech stopped (" + event.error +
					"). Narration playback is paused. Turn narration off and on to retry.",
				);
				latest.current.dispatch({ type: "pause" });
			};
			setError(null);
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
	}, [offered]);

	// A changed frame, corrected authored guidance, or an explicit seek
	// (including a seek to the current frame) starts a fresh utterance.
	useEffect(() => {
		if (!enabled || !offered) { stop(); return; }
		const voice = current.current;
		if (!voice || voice.trace !== trace || voice.step !== step ||
			voice.text !== text || voice.seekRevision !== seekRevision) {
			start();
		}
	}, [enabled, offered, trace, step, text, seekRevision, start, stop]);

	// The speech clock and the player's Play/Pause control share one state.
	// Pause/resume only if this instance still owns the global speech queue.
	useEffect(() => {
		const old = previous.current;
		previous.current = { trace, step, text, seekRevision, playing, enabled };
		if (!enabled || old.trace !== trace || old.step !== step ||
			old.text !== text || old.seekRevision !== seekRevision ||
			old.enabled !== enabled || old.playing === playing) return;
		const voice = current.current;
		if (!voice) return;
		if (voice.failed) {
			if (playing) dispatch({ type: "pause" });
			return;
		}
		if (!playing && !voice.ended) {
			if (ownsSpeech(voice.engine, voice.owner)) {
				try { voice.engine.pause(); } catch { /* No timeline mutation. */ }
			}
		} else if (playing) {
			if (voice.ended) {
				dispatch({ type: "tick" });
			} else if (ownsSpeech(voice.engine, voice.owner)) {
				try { voice.engine.resume(); } catch {
					setError("Speech could not resume.");
					dispatch({ type: "pause" });
				}
			}
		}
	}, [trace, step, text, seekRevision, playing, enabled, dispatch]);

	useEffect(() => () => stop(), [stop]);

	const toggle = useCallback(() => {
		if (latest.current.enabled) {
			stop();
			setError(null);
			setEnabled(false);
		} else if (speechEngine()) {
			// Speak within the user gesture, not just the following effect:
			// browsers may require activation to start the first utterance.
			setEnabled(true);
			start();
		} else {
			setError("Caption narration is unavailable in this browser.");
		}
	}, [setEnabled, start, stop]);

	return { available, error, toggle };
}
