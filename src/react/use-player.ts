import type * as React from "react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Trace } from "../model.js";
import {
	BASE_STEP_MS,
	initialSeek,
	type SeekAction,
	type SeekState,
	seekReducer,
	stepDelayMs,
} from "../seek.js";

export function usePlayer(trace: Trace, externalClock = false): {
	state: SeekState;
	dispatch: React.Dispatch<SeekAction>;
	lastAction: SeekAction | null;
	/** Increments on every explicit seek, including seeking the current frame. */
	seekRevision: number;
	onKeyDown: React.KeyboardEventHandler;
} {
	const [identity, setIdentity] = useState(trace);
	const [state, reducerDispatch] = useReducer(
		seekReducer,
		Math.max(0, trace.frames.length - 1),
		initialSeek,
	);
	// Track how a frame was reached without extending the public seek state.
	// Timeline seeks (even an adjacent one) never count as forward playback.
	const lastAction = useRef<SeekAction | null>(null);
	const [seekRevision, bumpSeekRevision] = useState(0);
	const dispatch = useCallback<React.Dispatch<SeekAction>>((action) => {
		lastAction.current = action;
		if (action.type === "step") bumpSeekRevision((revision) => revision + 1);
		reducerDispatch(action);
	}, []);
	// Reset during render, before any child can read a stale frame index.
	if (identity !== trace) {
		setIdentity(trace);
		dispatch({ type: "reset", max: Math.max(0, trace.frames.length - 1) });
	}
	useEffect(() => {
		if (!state.playing || externalClock) return;
		const timer = setInterval(
			() => dispatch({ type: "tick" }),
			stepDelayMs(BASE_STEP_MS, state.speed),
		);
		return () => clearInterval(timer);
	}, [state.playing, state.speed, externalClock]);
	const onKeyDown: React.KeyboardEventHandler = (event) => {
		if (event.target !== event.currentTarget) return;
		if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
			event.preventDefault();
			const to =
				event.key === "Home"
					? 0
					: event.key === "End"
						? state.max
						: state.step + (event.key === "ArrowRight" ? 1 : -1);
			dispatch({ type: "step", to, animate: event.key === "ArrowRight" });
		} else if (event.key === " " && state.max > 0) {
			event.preventDefault();
			dispatch({ type: "toggle" });
		}
	};
	return { state, dispatch, lastAction: lastAction.current, seekRevision, onKeyDown };
}

export function useSceneWidth(
	ref: React.RefObject<HTMLDivElement | null>,
): number {
	const [width, setWidth] = useState(720);
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry.contentRect.width > 0)
				setWidth(Math.floor(entry.contentRect.width));
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [ref]);
	return width;
}
