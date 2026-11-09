import type * as React from "react";
import {
	type SeekAction,
	type SeekState,
	SPEEDS,
	type Speed,
} from "../seek.js";

interface PlayerControlsProps {
	state: SeekState;
	dispatch: React.Dispatch<SeekAction>;
	sound?: { enabled: boolean; toggle: () => void };
	fullscreen: { active: boolean; available: boolean; toggle: () => void };
}

export function PlayerControls({
	state,
	dispatch,
	sound,
	fullscreen,
}: PlayerControlsProps): React.JSX.Element {
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
					onClick={() => dispatch({ type: "step", to: state.step + 1 })}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
						<path d="M19 5v14M5 5l8 7-8 7" />
					</svg>
				</button>
			</div>
			<input
				type="range"
				className="thl-timeline"
				aria-label="Timeline"
				aria-valuetext={`Step ${state.step + 1} of ${state.max + 1}`}
				min={0}
				max={state.max}
				value={state.step}
				disabled={state.max < 1}
				style={{ "--thl-progress": `${state.max ? (state.step / state.max) * 100 : 0}%` } as React.CSSProperties}
				onChange={(event) =>
					dispatch({ type: "step", to: Number(event.currentTarget.value) })
				}
			/>
			<div className="thl-utilities">
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
					</button>
				)}
				<button
					type="button"
					className="thl-fullscreen"
					aria-label={fullscreen.active ? "Minimize player" : "Maximize player"}
					title={fullscreen.active ? "Exit fullscreen" : "Enter fullscreen"}
					aria-pressed={fullscreen.active}
					disabled={!fullscreen.available}
					onClick={fullscreen.toggle}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
						{fullscreen.active ? (
							<path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
						) : (
							<path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
						)}
					</svg>
				</button>
			</div>
		</div>
	);
}
