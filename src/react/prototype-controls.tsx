import { useEffect, useId, useRef, useState } from "react";
import type * as React from "react";
import { type SeekAction, type SeekState, SPEEDS, type Speed } from "../seek.js";
import { PlayerIcon } from "./player-icons.js";

interface PlaybackProps {
 state: SeekState;
 dispatch: React.Dispatch<SeekAction>;
}
interface PlayerOptionsProps extends PlaybackProps {
 chapterControls?: (onSeek: (step: number) => void) => React.ReactNode;
 diagramControls?: React.ReactNode;
 sound?: { enabled: boolean; available?: boolean; toggle: () => void };
 narration?: { enabled: boolean; available: boolean; toggle: () => void };
 inspection?: { enabled: boolean; toggle: () => void };
 fullscreen: { active: boolean; available: boolean; toggle: () => void };
}

/** The prototype's compact transport, backed by Throughline's single reducer. */
export function PlayerControls({ state, dispatch }: PlaybackProps): React.JSX.Element {
 return <>
  <div className="transport-buttons" role="group" aria-label="Playback controls">
   <button type="button" aria-label="Step back" title="Step back"
    disabled={state.step === 0}
    onClick={() => dispatch({ type: "step", to: state.step - 1 })}>
    <PlayerIcon name="back"/>
   </button>
   <button type="button" className="play" aria-label={state.playing ? "Pause" : "Play"}
    title={state.playing ? "Pause" : "Play"} disabled={state.max < 1}
    onClick={() => dispatch({ type: "toggle" })}>
    <PlayerIcon name={state.playing ? "pause" : "play"} size={18}/>
   </button>
   <button type="button" aria-label="Step forward" title="Step forward"
    disabled={state.step === state.max}
    onClick={() => dispatch({ type: "step", to: state.step + 1, animate: true })}>
    <PlayerIcon name="forward"/>
   </button>
  </div>
  <div className="transport-meta">
   <span aria-label={`Step ${state.step + 1} of ${state.max + 1}`}>
    <strong>{state.step + 1}</strong> / {state.max + 1}
   </span>
   <button type="button" className="speed" aria-label={`Playback speed ${state.speed}x`}
    title="Playback speed" onClick={() => {
     const index = SPEEDS.indexOf(state.speed);
     dispatch({ type: "speed", to: SPEEDS[(index + 1) % SPEEDS.length] as Speed });
    }}>
    {state.speed}× <PlayerIcon name="chevron" size={12}/>
   </button>
  </div>
 </>;
}

/**
 * Prototype's anchored, dismissible Options menu. All content is native
 * Throughline state; it does not import the demo's scenarios or chapters.
 */
export function PlayerOptions({
 state, dispatch, chapterControls, diagramControls, sound, narration, inspection, fullscreen,
}: PlayerOptionsProps): React.JSX.Element {
 const id = useId();
 const [open, setOpen] = useState(false);
 const menuRef = useRef<HTMLDivElement>(null);
 const triggerRef = useRef<HTMLButtonElement>(null);
 const stepRef = useRef<HTMLInputElement>(null);
 useEffect(() => {
  if (!open) return;
  if (stepRef.current) stepRef.current.value = String(state.step + 1);
  const onPointer = (event: MouseEvent) => {
   if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
  };
  const onKey = (event: KeyboardEvent) => {
   if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
  };
  document.addEventListener("mousedown", onPointer);
  document.addEventListener("keydown", onKey);
  return () => {
   document.removeEventListener("mousedown", onPointer);
   document.removeEventListener("keydown", onKey);
  };
 }, [open, state.step]);
 const seek = (to: number) => { dispatch({ type: "step", to }); setOpen(false); };
 return <div className="menu-anchor" ref={menuRef}>
  <button ref={triggerRef} type="button" className={`menu-trigger ${open ? "active" : ""}`}
   aria-label="Player options" title="Player options" aria-haspopup="true"
   aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>
   <PlayerIcon name="options"/><span>Options</span><PlayerIcon name="chevron" size={12}/>
  </button>
  {open && <div id={id} className="options-menu" role="group" aria-label="Player options">
   <section aria-label="Navigation">
    <p className="opt-label">Navigation</p>
    {chapterControls?.(seek)}
    {state.max > 0 && <form className="opt-row go-to" onSubmit={event => {
     event.preventDefault();
     const value = Number(new FormData(event.currentTarget).get("step"));
     if (Number.isInteger(value) && value >= 1 && value <= state.max + 1)
      seek(value - 1);
    }}>
     <div className="opt-field">
      <label htmlFor={id + "-step"}>Go to step</label>
      <input id={id + "-step"} ref={stepRef} type="number" name="step" min={1}
       max={state.max + 1} defaultValue={state.step + 1} required/>
     </div>
     <button type="submit" className="opt-go">Go</button>
    </form>}
   </section>
   {diagramControls && <section aria-label="Diagram">
    <p className="opt-label">Diagram</p>
    <div className="opt-fieldset">{diagramControls}</div>
   </section>}
   <section aria-label="Playback and display">
    <p className="opt-label">Playback and display</p>
    <div className="speed-seg" role="radiogroup" aria-label="Playback speed">
     {SPEEDS.map(speed => <button type="button" role="radio" key={speed}
      aria-checked={state.speed === speed} className={state.speed === speed ? "on" : ""}
      onClick={() => dispatch({ type: "speed", to: speed })}>{speed}×</button>)}
    </div>
    <div className="opt-grid">
     {sound && <button type="button" className={`opt-toggle ${sound.enabled ? "on" : ""}`}
      aria-label="Sonify trace" aria-pressed={sound.enabled} disabled={sound.available === false}
      onClick={sound.toggle}>
      <PlayerIcon name={sound.enabled ? "sound" : "soundOff"} size={14}/><span>Sonify trace</span>
     </button>}
     {narration && <button type="button"
      className={`opt-toggle ${narration.enabled ? "on" : ""}`}
      aria-label="Narrate captions" title={narration.available ? "Read captions aloud" : "Narration unavailable"}
      aria-pressed={narration.enabled} disabled={!narration.available} onClick={narration.toggle}>
      <PlayerIcon name="narrate" size={14}/><span>Narrate captions</span>
     </button>}
     {inspection && <button type="button" className={`opt-toggle ${inspection.enabled ? "on" : ""}`}
      aria-label="Inspector" aria-pressed={inspection.enabled} onClick={inspection.toggle}>
      <PlayerIcon name="inspect" size={14}/><span>Inspector</span>
     </button>}
     <button type="button" className={`opt-toggle ${fullscreen.active ? "on" : ""}`}
      aria-label={fullscreen.active ? "Minimize player" : "Maximize player"}
      aria-pressed={fullscreen.active} disabled={!fullscreen.available}
      onClick={() => { setOpen(false); fullscreen.toggle(); }}>
      <PlayerIcon name={fullscreen.active ? "shrink" : "expand"} size={14}/>
      <span>{fullscreen.active ? "Minimize" : "Maximize"}</span>
     </button>
    </div>
   </section>
  </div>}
 </div>;
}
