/**
 * Player seek model: pure state transitions, no DOM, no timers. The React
 * binding (usePlayerInTimeline) drives these from an interval; tests drive
 * them directly.
 */

export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

export type SeekState = {
	/** Current frame index, 0..max. */
	step: number;
	max: number;
	playing: boolean;
	speed: Speed;
};

export type SeekAction =
	| { type: "reset"; max: number }
	| { type: "tick" }
	| { type: "toggle" }
	| { type: "pause" }
	| { type: "step"; to: number }
	| { type: "speed"; to: Speed };

export const initialSeek = (max: number): SeekState => ({
	step: 0,
	max,
	playing: false,
	speed: 1,
});

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

export function seekReducer(state: SeekState, action: SeekAction): SeekState {
	switch (action.type) {
		case "reset":
			return initialSeek(action.max);
		case "tick":
			if (!state.playing) return state;
			if (state.step >= state.max) return { ...state, playing: false };
			return {
				...state,
				step: state.step + 1,
				playing: state.step + 1 < state.max,
			};
		case "toggle":
			if (state.playing) return { ...state, playing: false };
			if (state.step >= state.max) return { ...state, step: 0, playing: true };
			return { ...state, playing: true };
		case "pause":
			return { ...state, playing: false };
		case "step":
			return { ...state, step: clamp(action.to, state.max), playing: false };
		case "speed":
			return { ...state, speed: action.to };
	}
}

/** Milliseconds per frame at the given speed; `base` is the 1x cadence. */
export const stepDelayMs = (base: number, speed: Speed): number =>
	Math.round(base / speed);
