import { cn } from "cn";
import type * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { describeFrame } from "../describe.js";
import { composeTrace } from "../layout.js";
import type { Trace } from "../model.js";
import type { SonificationOptions } from "../sonify.js";
import { PlayerCaption } from "./caption.js";
import { PlayerControls } from "./controls.js";
import { TraceScene } from "./scene.js";
import { usePlayer, useSceneWidth } from "./use-player.js";
import { useSound } from "./use-sound.js";

export interface ThroughlinePlayerProps {
	trace: Trace;
	/** Optional, unbranded heading above the visualization. */
	title?: string;
	className?: string;
	theme?: "light" | "dark" | "auto";
	/** Omit to remove audio controls entirely. */
	sonification?: SonificationOptions;
}

export function ThroughlinePlayer({
	trace,
	title,
	className,
	theme = "auto",
	sonification,
}: ThroughlinePlayerProps): React.JSX.Element {
	const ref = useRef<HTMLDivElement>(null);
	const sceneRef = useRef<HTMLDivElement>(null);
	const width = useSceneWidth(sceneRef);
	const { state, dispatch, onKeyDown } = usePlayer(trace);
	const [sound, setSound] = useState(sonification?.enabled ?? false);
	const [fullscreen, setFullscreen] = useState(false);
	const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
	const layout = useMemo(() => composeTrace(trace, width), [trace, width]);
	const captionId = useId();
	const frame = trace.frames[state.step] ?? trace.frames[0];

	useEffect(() => {
		const syncFullscreen = () => {
			setFullscreen(document.fullscreenElement === ref.current);
			setFullscreenAvailable(
				Boolean(
					document.fullscreenEnabled &&
						ref.current?.requestFullscreen &&
						document.exitFullscreen,
				),
			);
		};
		syncFullscreen();
		document.addEventListener("fullscreenchange", syncFullscreen);
		return () => document.removeEventListener("fullscreenchange", syncFullscreen);
	}, []);

	const toggleFullscreen = () => {
		const element = ref.current;
		if (!element || !document.fullscreenEnabled) return;
		if (document.fullscreenElement === element) {
			void document.exitFullscreen().catch(() => {});
		} else if (!document.fullscreenElement) {
			void element.requestFullscreen().catch(() => {});
		}
	};

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
			{title && <h2 className="thl-title">{title}</h2>}
			{/* This measured stage must exist even for empty traces so ResizeObserver
			    stays connected through empty/populated trace replacements. */}
			<div className="thl-stage" ref={sceneRef}>
				{frame ? (
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
				) : (
					<p className="thl-empty">No steps to display.</p>
				)}
			</div>
			{frame && (
				<>
					<PlayerCaption
						frame={frame}
						id={captionId}
						total={trace.frames.length}
					/>
					<PlayerControls
						state={state}
						dispatch={dispatch}
						sound={
							sonification
								? { enabled: sound, toggle: () => setSound(!sound) }
								: undefined
						}
						fullscreen={{
							active: fullscreen,
							available: fullscreenAvailable,
							toggle: toggleFullscreen,
						}}
					/>
				</>
			)}
		</div>
	);
}
