import { useEffect, useId, useRef, useState } from "react";
import type * as React from "react";
import { type SeekAction, type SeekState, SPEEDS, type Speed } from "../seek.js";
import { PlayerIcon } from "./player-icons.js";

interface PlaybackProps {
 state: SeekState;
 dispatch: React.Dispatch<SeekAction>;
}
interface PlayerOptionsProps extends PlaybackProps {
 diagramControls?: React.ReactNode;
 sound?: { enabled: boolean; available?: boolean; toggle: () => void };
 narration?: { enabled: boolean; available: boolean; toggle: () => void };
 inspection?: { enabled: boolean; toggle: () => void };
 fullscreen: { active: boolean; available: boolean; toggle: () => void };
}

/** Compact player transport, backed by Throughline's single reducer. */
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
  <input className="timeline-scrubber" type="range" aria-label="Timeline position"
   min={0} max={state.max} value={state.step} disabled={state.max < 1}
   aria-valuetext={`Step ${state.step + 1} of ${state.max + 1}`}
   onChange={event => dispatch({ type: "step", to: Number(event.currentTarget.value) })}/>
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
 * Anchored, dismissible player options. All content is native
 * Throughline state; it does not import the demo's scenarios or chapters.
 */
export function PlayerOptions({
 state, dispatch, diagramControls, sound, narration, inspection, fullscreen,
}: PlayerOptionsProps): React.JSX.Element {
 const id = useId();
 const [open, setOpen] = useState(false);
 const menuRef = useRef<HTMLDivElement>(null);
 const triggerRef = useRef<HTMLButtonElement>(null);
 const stepRef = useRef<HTMLInputElement>(null);
 const popupRef = useRef<HTMLDivElement>(null);
 useEffect(() => {
  if (!open) return;
  popupRef.current?.querySelector<HTMLElement>("button, input, select")?.focus();
  const onPointer = (event: PointerEvent) => {
   if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
  };
  const onKey = (event: KeyboardEvent) => {
   if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
  };
  document.addEventListener("pointerdown", onPointer);
  document.addEventListener("keydown", onKey);
  return () => {
   document.removeEventListener("pointerdown", onPointer);
   document.removeEventListener("keydown", onKey);
  };
 }, [open]);
 useEffect(() => {
  if (open && stepRef.current) stepRef.current.value = String(state.step + 1);
 }, [open, state.step]);
 const seek = (to: number) => { dispatch({ type: "step", to }); setOpen(false); triggerRef.current?.focus(); };
 return <div className="menu-anchor" ref={menuRef} onBlur={event => {
  if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
 }}>
  <button ref={triggerRef} type="button" className={`menu-trigger ${open ? "active" : ""}`}
   aria-label="Player options" title="Player options" aria-haspopup="dialog"
   aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>
   <PlayerIcon name="options"/><span>Options</span><PlayerIcon name="chevron" size={12}/>
  </button>
  {open && <div id={id} ref={popupRef} className="options-menu" role="dialog" aria-label="Player options">
   <div className="options-heading"><strong>Player options</strong>
    <button type="button" aria-label="Close options" onClick={() => {
     setOpen(false); triggerRef.current?.focus();
    }}>×</button>
   </div>
   <section aria-label="Navigation">
    <p className="opt-label">Navigation</p>
    <button type="button" className="opt-toggle" onClick={() => seek(0)}>
     <PlayerIcon name="restart" size={14}/><span>Restart timeline</span>
    </button>
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
