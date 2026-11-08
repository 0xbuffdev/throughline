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
}
export function PlayerControls({
	state,
	dispatch,
	sound,
}: PlayerControlsProps): React.JSX.Element {
	return (
		<div className="thl-controls">
			<button
				type="button"
				aria-label="Step back"
				disabled={state.step === 0}
				onClick={() => dispatch({ type: "step", to: state.step - 1 })}
			>
				←
			</button>
			<button
				type="button"
				className="thl-play"
				aria-label={state.playing ? "Pause" : "Play"}
				disabled={state.max < 1}
				onClick={() => dispatch({ type: "toggle" })}
			>
				{state.playing
					? "Pause"
					: state.step === state.max && state.max > 0
						? "Replay"
						: "Play"}
			</button>
			<button
				type="button"
				aria-label="Step forward"
				disabled={state.step === state.max}
				onClick={() => dispatch({ type: "step", to: state.step + 1 })}
			>
				→
			</button>
			<input
				type="range"
				className="thl-timeline"
				aria-label="Timeline"
				aria-valuetext={`Step ${state.step + 1} of ${state.max + 1}`}
				min={0}
				max={state.max}
				value={state.step}
				disabled={state.max < 1}
				onChange={(event) =>
					dispatch({ type: "step", to: Number(event.currentTarget.value) })
				}
			/>
			<span className="thl-count">
				{state.step + 1} / {state.max + 1}
			</span>
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
					aria-label="Sonify trace"
					aria-pressed={sound.enabled}
					onClick={sound.toggle}
				>
					Sound
				</button>
			)}
		</div>
	);
}
