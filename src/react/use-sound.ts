import { useEffect, useRef } from "react";
import { type SonificationOptions, sonificationEvent } from "../sonify.js";

/** One short voice at a time; seeking or disabling sound stops the previous voice. */
export function useSound(
	step: number,
	total: number,
	enabled: boolean,
	options?: SonificationOptions,
): void {
	const context = useRef<AudioContext | null>(null);
	const handler = options?.onTone;
	useEffect(
		() => () => {
			const audio = context.current;
			context.current = null;
			void audio?.close().catch(() => {});
		},
		[],
	);
	useEffect(() => {
		if (!enabled || total === 0) return;
		const event = sonificationEvent(step, total);
		try {
			if (handler) {
				handler(event);
				return;
			}
			if (typeof AudioContext === "undefined") return;
			context.current ??= new AudioContext();
			const audio = context.current;
			void audio.resume().catch(() => {});
			const oscillator = audio.createOscillator();
			const gain = audio.createGain();
			const now = audio.currentTime;
			oscillator.frequency.value = event.frequency;
			gain.gain.setValueAtTime(0.0001, now);
			gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
			gain.gain.exponentialRampToValueAtTime(
				0.0001,
				now + event.durationMs / 1000,
			);
			oscillator.connect(gain);
			gain.connect(audio.destination);
			let released = false;
			const release = () => {
				if (released) return;
				released = true;
				oscillator.disconnect();
				gain.disconnect();
			};
			oscillator.onended = release;
			oscillator.start();
			oscillator.stop(now + event.durationMs / 1000 + 0.02);
			return () => {
				// A scheduled voice may already have ended when playback changes.
				try {
					oscillator.stop();
				} catch {
					// Stopping an already-ended oscillator must not break cleanup.
				}
				release();
			};
		} catch {
			// Audio is optional; unavailable hardware or a consumer callback cannot stop playback.
		}
	}, [step, total, enabled, handler]);
}
