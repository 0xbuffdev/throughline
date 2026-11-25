import { useCallback, useEffect, useRef, useState } from "react";
import type { SeekAction, Speed } from "../seek.js";
import {
	acquireSpeech,
	cancelOwnedSpeech,
	ownsSpeech,
	releaseSpeech,
	type SpeechOwner,
} from "./speech-owner.js";

type Session = {
	trace: object;
	step: number;
	text: string;
	seekRevision: number;
	speed: Speed;
	utterance: SpeechSynthesisUtterance;
	engine: SpeechSynthesis;
	owner: SpeechOwner;
	ended: boolean;
	failed: boolean;
};

type NarrationInput = {
	trace: object;
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
	const previous = useRef({ trace, step, seekRevision, playing, enabled });
	// Pausing autoplay differs from intentionally reading a manually selected
	// frame while the transport is idle. Retain that distinction across rates.
	const transportPaused = useRef(false);

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
			const suffix = " Narration shortened. Read the caption and inspector for complete evidence.";
			const spoken = state.text.length <= 3000 ? state.text :
				state.text.slice(0, 3000 - suffix.length).replace(/[\uD800-\uDBFF]$/, "").trimEnd() + suffix;
			const utterance = new SpeechSynthesisUtterance(spoken);
			utterance.rate = state.speed;
			const session: Session = {
				trace: state.trace, step: state.step, text: state.text,
				seekRevision: state.seekRevision, speed: state.speed, utterance, engine,
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
					next.seekRevision === session.seekRevision && next.speed === session.speed && next.playing) {
					next.dispatch({ type: "tick" });
				}
			};
			utterance.onerror = (event) => {
				if (current.current !== session || session.failed || !ownsSpeech(session.engine, session.owner)) return;
				const next = latest.current;
				if (!next.enabled || next.trace !== session.trace || next.step !== session.step ||
					next.text !== session.text || next.seekRevision !== session.seekRevision || next.speed !== session.speed) return;
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

	// Coordinate the speech lifecycle in one effect: explicit seeks enable
	// manual reading, while a rate/text change alone cannot undo Pause.
	useEffect(() => {
		const old = previous.current;
		previous.current = { trace, step, seekRevision, playing, enabled };
		if (!enabled || !offered) {
			transportPaused.current = false;
			stop();
			return;
		}
		const newFrame = old.trace !== trace || old.step !== step ||
			old.seekRevision !== seekRevision;
		if (newFrame || !old.enabled || playing) {
			transportPaused.current = false;
		} else if (old.playing && !playing) {
			transportPaused.current = true;
		}

		const voice = current.current;
		if (!voice || voice.trace !== trace || voice.step !== step ||
			voice.text !== text || voice.seekRevision !== seekRevision || voice.speed !== speed) {
			if (transportPaused.current) {
				// Invalidate old callbacks and relinquish the old voice; do
				// not speak or resume the global queue until Play or a seek.
				stop();
			} else {
				start();
			}
			return;
		}
		if (newFrame || old.enabled !== enabled || old.playing === playing) return;
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
	}, [trace, step, text, seekRevision, speed, playing, enabled, offered, dispatch, start, stop]);

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
