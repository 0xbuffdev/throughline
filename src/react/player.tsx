import { cn } from "cn";
import type * as React from "react";
import { useId, useMemo, useRef, useState } from "react";
import { describeFrame } from "../describe.js";
import { composeTrace } from "../layout.js";
import type { Trace } from "../model.js";
import type { SonificationOptions } from "../sonify.js";
import { PlayerCaption } from "./caption.js";
import { PlayerControls } from "./controls.js";
import { StateInspector } from "./inspector.js";
import { TraceScene } from "./scene.js";
import { usePlayer, useSceneWidth } from "./use-player.js";
import { useSound } from "./use-sound.js";

export interface ThroughlinePlayerProps {
	trace: Trace;
	className?: string;
	theme?: "light" | "dark" | "auto";
	/** Omit to remove audio controls entirely. */
	sonification?: SonificationOptions;
}

export function ThroughlinePlayer({
	trace,
	className,
	theme = "auto",
	sonification,
}: ThroughlinePlayerProps): React.JSX.Element {
	const ref = useRef<HTMLDivElement>(null);
	const width = useSceneWidth(ref);
	const { state, dispatch, onKeyDown } = usePlayer(trace);
	const [sound, setSound] = useState(sonification?.enabled ?? false);
	const layout = useMemo(() => composeTrace(trace, width), [trace, width]);
	const captionId = useId();
	const frame = trace.frames[state.step] ?? trace.frames[0];
	useSound(
		state.step,
		trace.frames.length,
		!!sonification && sound,
		sonification,
	);
	const summary = frame
		? describeFrame(frame, trace.frames.length)
		: "No steps to display.";
	return (
		// biome-ignore lint/a11y/useSemanticElements: one focusable group owns scene stepping without changing native control keys.
		<div
			ref={ref}
			className={cn("thl", className)}
			data-theme={theme}
			role="group"
			aria-label="Visualization player"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: the group exposes documented Arrow/Home/End/Space shortcuts.
			tabIndex={0}
			onKeyDown={onKeyDown}
		>
			<p role="status" className="thl-sr-only">
				{summary}
			</p>
			{frame ? (
				<>
					<svg
						width="100%"
						height={layout.height}
						viewBox={layout.viewBox}
						role="img"
						aria-label={summary}
						aria-describedby={captionId}
						className="thl-scene"
					>
						<TraceScene
							frame={frame}
							previous={trace.frames[state.step - 1]}
							layout={layout}
						/>
					</svg>
					<PlayerCaption frame={frame} id={captionId} />
					<PlayerControls
						state={state}
						dispatch={dispatch}
						sound={
							sonification
								? { enabled: sound, toggle: () => setSound(!sound) }
								: undefined
						}
					/>
					<StateInspector frame={frame} />
				</>
			) : (
				<p className="thl-empty">No steps to display.</p>
			)}
		</div>
	);
}
