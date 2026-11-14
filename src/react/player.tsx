import { cn } from "cn";
import type * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { describeFrame } from "../describe.js";
import { composeTrace } from "../layout.js";
import { traceProgress } from "../scene/progress.js";
import { ProgramError, type Trace } from "../model.js";
import { BASE_STEP_MS, stepDelayMs } from "../seek.js";
import type { SonificationOptions } from "../sonify.js";
import { PlayerCaption } from "./caption.js";
import { PlayerGuidanceControls, validateGuidance, type ThroughlineGuidance } from "./guidance.js";
import { PlayerControls, PlayerOptions } from "./controls.js";
import { narrationText } from "./narration-text.js";
import { useNarration } from "./use-narration.js";
import { useViewport } from "./viewport.js";
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
	/** Opt in to the browser caption-narration toggle; muted until user activation. */
	narration?: boolean;
	/** Optional, explicitly authored, trace-scoped chapters and causal evidence. */
	guidance?: ThroughlineGuidance;
}

export function ThroughlinePlayer({
	trace,
	title,
	className,
	theme = "auto",
	sonification,
	narration = false,
	guidance,
}: ThroughlinePlayerProps): React.JSX.Element {
	// Check the reader version before any hook inspects a serialized trace.
	if (!trace || trace.version !== 1 || !Array.isArray(trace.frames)) {
		throw new ProgramError([{ message: "Expected trace version 1 and frames array." }]);
	}
	const ref = useRef<HTMLDivElement>(null);
	const sceneRef = useRef<HTMLDivElement>(null);
	const width = useSceneWidth(sceneRef);
	const [narrating, setNarrating] = useState(false);
	// A host withdrawing the optional feature also discards consent,
	// including when it later re-enables the control on this instance.
	useEffect(() => { if (!narration) setNarrating(false); }, [narration]);
	const { state, dispatch, lastAction, seekRevision, onKeyDown } = usePlayer(trace, narration && narrating);
	const [sound, setSound] = useState(sonification?.enabled ?? false);
	const [fullscreen, setFullscreen] = useState(false);
	const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
	const [fullscreenError, setFullscreenError] = useState<string | null>(null);
	const layout = useMemo(() => composeTrace(trace, width), [trace, width]);
	const progress = useMemo(() => traceProgress(trace, state.step), [trace, state.step]);
	// Motion is presentation-only and decided when the step changes: only a
	// forward single step animates. Seeks, rewinds and replaced traces show the
	// settled frame at once, so a direct jump never replays transfers.
	// The decision is latched per step so unrelated re-renders cannot restart
	// or cancel an animation in progress.
	const [motion, setMotion] = useState({ trace, step: state.step, animate: false });
	if (motion.trace !== trace || motion.step !== state.step) {
		setMotion({
			trace,
			step: state.step,
			animate: motion.trace === trace && state.step - motion.step === 1 &&
				(lastAction?.type === "tick" || (lastAction?.type === "step" && lastAction.animate === true)),
		});
	}
	const captionId = useId();
	const keyboardHelpId = useId();
	const frame = trace.frames[state.step] ?? trace.frames[0];
	const spokenText = frame ? narrationText(frame, trace, guidance) : "";
	const voice = useNarration({
		trace, step: state.step, text: spokenText, seekRevision, speed: state.speed,
		playing: state.playing, enabled: narration && narrating, setEnabled: setNarrating,
		dispatch, offered: narration && !!frame,
	});

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
				...(progress.participatingNodes.size || progress.traversedRelations.size
					? [`Workflow so far: ${progress.participatingNodes.size} participating nodes and ${progress.traversedRelations.size} sent connections.`]
					: []),
				chapter && "Chapter: " + chapter.title + ".",
				...causal.map((item) => "Authored explanation: " + item.title + "."),
			].filter(Boolean).join(" ")
		: "No steps to display.";
	const viewport = useViewport({
		trace,
		frame,
		previous: trace.frames[state.step - 1],
		layout,
		progress,
		animate: motion.animate,
		availableWidth: width,
		fullscreen,
		summary,
		captionId,
	});
	return (
		// biome-ignore lint/a11y/useSemanticElements: one focusable group owns scene stepping without changing native control keys.
		<div
			ref={ref}
			className={cn("thl", className)}
			data-theme={theme}
			style={{ "--thl-step-ms": `${stepDelayMs(BASE_STEP_MS, state.speed)}ms` } as React.CSSProperties}
			role="group"
			aria-label="Visualization player"
			aria-describedby={keyboardHelpId}
			aria-keyshortcuts="ArrowLeft ArrowRight Home End Space"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: the group exposes documented Arrow/Home/End/Space shortcuts.
			tabIndex={0}
			onKeyDown={onKeyDown}
		>
			<p id={keyboardHelpId} className="thl-sr-only">
				Focus this player to use Left and Right arrows to step, Home and End to seek, and Space to play or pause. Focus the diagram to pan with arrow keys, zoom with plus or minus, fit with zero, and select entities from Player options. Controls also work independently.
			</p>
			<p role="status" aria-atomic="true" className="thl-sr-only">
				{summary}
			</p>
			{voice.error && narration && <p role="alert" className="thl-narration-error">{voice.error}</p>}
			{fullscreenError && (
				<p role="alert" className="thl-sr-only">
					{fullscreenError}
				</p>
			)}
			{(title || frame) && (
				<header className="thl-header">
					{title && <h2 className="thl-title">{title}</h2>}
					{frame && (
						<PlayerOptions
							state={state}
							dispatch={dispatch}
							chapterControls={guidance?.chapters?.length ? (onSeek) => (
								<PlayerGuidanceControls trace={trace} frame={frame} guidance={guidance} onSeek={onSeek} />
							) : undefined}
							diagramControls={viewport.options}
							narration={narration ? {
								enabled: narrating,
								available: voice.available,
								toggle: voice.toggle,
							} : undefined}
							sound={sonification ? { enabled: sound, toggle: () => setSound((enabled) => !enabled) } : undefined}
							fullscreen={{ active: fullscreen, available: fullscreenAvailable, toggle: toggleFullscreen }}
						/>
					)}
				</header>
			)}
			<div className="thl-stage">
				<div className="thl-viewport">
					{viewport.tools}
					{/* Keep the measured canvas mounted through empty/populated trace replacements. */}
					<div className="thl-canvas" ref={sceneRef}>{viewport.scene}</div>
				</div>
				{frame && (
					<>
						<div className="thl-bottom">
							<PlayerControls state={state} dispatch={dispatch} />
						</div>
						<PlayerCaption
							frame={frame}
							trace={trace}
							guidance={guidance}
							onSeek={(step) => dispatch({ type: "step", to: step })}
							id={captionId}
						/>
						{viewport.selection}
					</>
				)}
			</div>
		</div>
	);
}
