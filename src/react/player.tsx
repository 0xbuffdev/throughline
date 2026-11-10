import { cn } from "cn";
import type * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { describeFrame } from "../describe.js";
import { composeTrace } from "../layout.js";
import type { Trace } from "../model.js";
import type { SonificationOptions } from "../sonify.js";
import { PlayerCaption } from "./caption.js";
import { validateGuidance, type ThroughlineGuidance } from "./guidance.js";
import { PlayerControls } from "./controls.js";
import { ViewportScene } from "./viewport.js";
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
	/** Optional, explicitly authored, trace-scoped chapters and causal evidence. */
	guidance?: ThroughlineGuidance;
}

export function ThroughlinePlayer({
	trace,
	title,
	className,
	theme = "auto",
	sonification,
	guidance,
}: ThroughlinePlayerProps): React.JSX.Element {
	const ref = useRef<HTMLDivElement>(null);
	const sceneRef = useRef<HTMLDivElement>(null);
	const width = useSceneWidth(sceneRef);
	const { state, dispatch, onKeyDown } = usePlayer(trace);
	const [sound, setSound] = useState(sonification?.enabled ?? false);
	const [fullscreen, setFullscreen] = useState(false);
	const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
	const [fullscreenError, setFullscreenError] = useState<string | null>(null);
	const layout = useMemo(() => composeTrace(trace, width), [trace, width]);
	const captionId = useId();
	const keyboardHelpId = useId();
	const frame = trace.frames[state.step] ?? trace.frames[0];

	useEffect(() => {
		const syncFullscreen = () => {
			const active = document.fullscreenElement;
			setFullscreen(active === ref.current);
			setFullscreenAvailable(
				Boolean(
					document.fullscreenEnabled &&
						typeof ref.current?.requestFullscreen === "function" &&
						typeof document.exitFullscreen === "function" &&
						(!active || active === ref.current),
				),
			);
			if (active === ref.current) setFullscreenError(null);
		};
		const onFullscreenError = (event: Event) => {
			if (event.target === ref.current)
				setFullscreenError("Fullscreen is unavailable in this browser or embedded view.");
		};
		syncFullscreen();
		document.addEventListener("fullscreenchange", syncFullscreen);
		document.addEventListener("fullscreenerror", onFullscreenError);
		return () => {
			document.removeEventListener("fullscreenchange", syncFullscreen);
			document.removeEventListener("fullscreenerror", onFullscreenError);
		};
	}, []);

	const toggleFullscreen = async () => {
		const element = ref.current;
		if (
			!element ||
			!document.fullscreenEnabled ||
			!element.requestFullscreen ||
			!document.exitFullscreen
		) return;
		setFullscreenError(null);
		try {
			if (document.fullscreenElement === element) {
				await document.exitFullscreen();
			} else if (!document.fullscreenElement) {
				await element.requestFullscreen();
			}
		} catch {
			setFullscreenError("Fullscreen is unavailable in this browser or embedded view.");
		}
	};

	useSound(trace, state.step, !!sonification && sound, sonification);
	if (guidance) validateGuidance(trace, guidance);
	const chapter = guidance?.chapters?.find((item) => frame && frame.index >= item.start && frame.index <= item.end);
	const causal = guidance?.causalLinks?.filter((item) => item.step === frame?.index) ?? [];
	const summary = frame
		? [
				describeFrame(frame, trace.frames.length),
				chapter && "Chapter: " + chapter.title + ".",
				...causal.map((item) => "Authored explanation: " + item.title + "."),
			].filter(Boolean).join(" ")
		: "No steps to display.";
	return (
		// biome-ignore lint/a11y/useSemanticElements: one focusable group owns scene stepping without changing native control keys.
		<div
			ref={ref}
			className={cn("thl", className)}
			data-theme={theme}
			role="group"
			aria-label="Visualization player"
			aria-describedby={keyboardHelpId}
			aria-keyshortcuts="ArrowLeft ArrowRight Home End Space"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: the group exposes documented Arrow/Home/End/Space shortcuts.
			tabIndex={0}
			onKeyDown={onKeyDown}
		>
			<p id={keyboardHelpId} className="thl-sr-only">
				Focus this player to use Left and Right arrows to step, Home and End to seek, and Space to play or pause. Focus the diagram to pan with arrow keys, zoom with plus or minus, fit with zero, and select entities from the navigation menu. Controls also work independently.
			</p>
			<p role="status" aria-atomic="true" className="thl-sr-only">
				{summary}
			</p>
			{fullscreenError && (
				<p role="alert" className="thl-sr-only">
					{fullscreenError}
				</p>
			)}
			{title && <h2 className="thl-title">{title}</h2>}
			{/* This measured stage must exist even for empty traces so ResizeObserver
			    stays connected through empty/populated trace replacements. */}
			<div className="thl-stage" ref={sceneRef}>
				<ViewportScene
					trace={trace}
					frame={frame}
					previous={trace.frames[state.step - 1]}
					layout={layout}
					summary={summary}
					captionId={captionId}
				/>
			</div>
			{frame && (
				<>
					<PlayerCaption
						frame={frame}
						trace={trace}
						guidance={guidance}
						onSeek={(step) => dispatch({ type: "step", to: step })}
						id={captionId}
						total={trace.frames.length}
					/>
					<PlayerControls
						state={state}
						dispatch={dispatch}
						sound={
							sonification
								? { enabled: sound, toggle: () => setSound((enabled) => !enabled) }
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
