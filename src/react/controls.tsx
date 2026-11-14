import { useId, useRef } from "react";
import type * as React from "react";
import {
	type SeekAction,
	type SeekState,
	SPEEDS,
	type Speed,
} from "../seek.js";

interface PlaybackProps {
	state: SeekState;
	dispatch: React.Dispatch<SeekAction>;
}

interface PlayerOptionsProps extends PlaybackProps {
	chapterControls?: (onSeek: (step: number) => void) => React.ReactNode;
	diagramControls?: React.ReactNode;
	sound?: { enabled: boolean; toggle: () => void };
	narration?: { enabled: boolean; available: boolean; toggle: () => void };
	fullscreen: { active: boolean; available: boolean; toggle: () => void };
}

export function PlayerControls({ state, dispatch }: PlaybackProps): React.JSX.Element {
	return (
		<div className="thl-controls" role="group" aria-label="Playback controls">
			<div className="thl-transport">
				<button
					type="button"
					aria-label="Step back"
					title="Step back"
					disabled={state.step === 0}
					onClick={() => dispatch({ type: "step", to: state.step - 1 })}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
						<path d="M5 5v14M19 5l-8 7 8 7" />
					</svg>
				</button>
				<button
					type="button"
					className="thl-play"
					aria-label={state.playing ? "Pause" : "Play"}
					title={state.playing ? "Pause" : "Play"}
					disabled={state.max < 1}
					onClick={() => dispatch({ type: "toggle" })}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
						{state.playing ? (
							<path d="M9 5v14M15 5v14" />
						) : (
							<path d="m9 5 10 7-10 7z" />
						)}
					</svg>
				</button>
				<button
					type="button"
					aria-label="Step forward"
					title="Step forward"
					disabled={state.step === state.max}
					onClick={() => dispatch({ type: "step", to: state.step + 1, animate: true })}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
						<path d="M19 5v14M5 5l8 7-8 7" />
					</svg>
				</button>
			</div>
			<span className="thl-step-count">
				<span className="thl-step-count-full">Step {state.step + 1} of {state.max + 1}</span>
				<span className="thl-step-count-short" aria-hidden="true">{state.step + 1} / {state.max + 1}</span>
			</span>
			<span className="thl-speed-control">
				<select
					aria-label="Playback speed"
					value={state.speed}
					onChange={(event) =>
						dispatch({
							type: "speed",
							to: Number(event.currentTarget.value) as Speed,
						})
					}
				>
					{SPEEDS.map((speed) => (
						<option key={speed} value={speed}>
							{speed}×
						</option>
					))}
				</select>
				<svg
					className="thl-speed-chevron"
					viewBox="0 0 16 16"
					fill="none"
					aria-hidden="true"
				>
					<path d="m3.5 6 4.5 4 4.5-4" />
				</svg>
			</span>
		</div>
	);
}

export function PlayerOptions({ state, dispatch, chapterControls, diagramControls, sound, narration, fullscreen }: PlayerOptionsProps): React.JSX.Element {
	const panelId = useId();
	const panelRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const stepRef = useRef<HTMLInputElement>(null);
	const close = () => {
		panelRef.current?.hidePopover();
		triggerRef.current?.focus();
	};
	const seek = (step: number) => {
		dispatch({ type: "step", to: step });
		close();
	};
	return (
		<>
			<button ref={triggerRef} type="button" className="thl-options-trigger" aria-label="Player options" title="Player options" popoverTarget={panelId}>
				<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
					<path d="M4 6h8m4 0h4M4 12h3m4 0h9M4 18h10m4 0h2M12 4v4M7 10v4m7 2v4" />
				</svg>
			</button>
			<div id={panelId} ref={panelRef} className="thl-popover thl-options" popover="auto" role="group" aria-label="Player options"
				onBeforeToggle={(event) => {
					if (event.newState === "open" && stepRef.current) stepRef.current.value = String(state.step + 1);
				}}
				onToggle={(event) => {
					if (event.newState === "open") event.currentTarget.scrollTop = 0;
				}}
			>
				{(chapterControls || state.max > 0) && (
					<div className="thl-options-section" role="group" aria-label="Navigation">
						<p className="thl-options-label">Navigation</p>
						{chapterControls?.(seek)}
						{state.max > 0 && (
							<form onSubmit={(event) => {
								event.preventDefault();
								const step = Number(new FormData(event.currentTarget).get("step"));
								if (!Number.isInteger(step) || step < 1 || step > state.max + 1) return;
								seek(step - 1);
							}}>
								<input ref={stepRef} type="number" aria-label="Step number" name="step" min={1} max={state.max + 1} defaultValue={state.step + 1} required />
								<button type="submit">Go to step</button>
							</form>
						)}
					</div>
				)}
				{diagramControls && (
					<div className="thl-options-section thl-view-options" role="group" aria-label="Diagram">
						<p className="thl-options-label">Diagram</p>
						{diagramControls}
					</div>
				)}
				<div className="thl-options-section" role="group" aria-label="Playback and display">
					<p className="thl-options-label">Playback and display</p>
					{sound && (
						<button
							type="button"
							className="thl-sound"
							aria-label="Sonify trace"
							title={sound.enabled ? "Mute trace" : "Unmute trace"}
							aria-pressed={sound.enabled}
							onClick={sound.toggle}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
								<path d="M4 9h4l5-4v14l-5-4H4z" />
								{sound.enabled ? (
									<path d="M16 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" />
								) : (
									<path d="m17 9 5 6m0-6-5 6" />
								)}
							</svg>
							<span>Sonify trace</span>
						</button>
					)}
					{narration && (
						<button
							type="button"
							className="thl-narration"
							aria-label="Narrate captions"
							title={narration.available ? (narration.enabled ? "Stop narration" : "Read captions aloud") : "Narration unavailable"}
							aria-pressed={narration.enabled}
							disabled={!narration.available}
							onClick={narration.toggle}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
								<path d="M4 7h9M4 12h7M4 17h8" />
								<path d="M17 8a4 4 0 0 1 0 8M19 5a8 8 0 0 1 0 14" />
							</svg>
							<span>Narrate captions</span>
						</button>
					)}
					<button
						type="button"
						className="thl-fullscreen"
						aria-label={fullscreen.active ? "Minimize player" : "Maximize player"}
						title={fullscreen.active ? "Exit fullscreen" : "Enter fullscreen"}
						aria-pressed={fullscreen.active}
						disabled={!fullscreen.available}
						onClick={() => {
							close();
							fullscreen.toggle();
						}}
					>
						<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
							{fullscreen.active ? (
								<path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
							) : (
								<path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
							)}
						</svg>
						<span>{fullscreen.active ? "Minimize player" : "Maximize player"}</span>
					</button>
				</div>
			</div>
		</>
	);
}
