import type * as React from "react";
import { useId } from "react";
import type { Frame, Trace } from "../model.js";

/** Chapters are inclusive frame ranges and never alter compiled frames. */
export interface GuidedChapter {
	id: string;
	title: string;
	start: number;
	end: number;
	summary?: string;
}

/** A zero-based event index in an authored frame, not an inferred event. */
export interface GuidanceEvidence {
	step: number;
	event: number;
}

/**
 * Every part of this explanation is supplied by the author. Evidence anchors
 * it to real compiled events; the player does not infer causation from order.
 */
export interface CausalLink {
	id: string;
	title: string;
	/** Frame at which the authored explanation becomes visible. */
	step: number;
	trigger: string;
	observedEvent: string;
	stateChange: string;
	consequence: string;
	evidence: readonly GuidanceEvidence[];
}

export interface ThroughlineGuidance {
	chapters?: readonly GuidedChapter[];
	causalLinks?: readonly CausalLink[];
}

function assertText(value: unknown, name: string): void {
	if (typeof value !== "string" || !value.trim() || value.length > 4096) {
		throw new Error(name + " must be nonempty text of at most 4096 characters.");
	}
}

function assertId(id: string, kind: string, used: Set<string>): void {
	if (typeof id !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id)) {
		throw new Error(kind + " must have an ASCII identifier (1–64 characters).");
	}
	if (used.has(id)) throw new Error("Duplicate " + kind + ": " + id);
	used.add(id);
}

function assertStep(step: number, trace: Trace, name: string): void {
	if (!Number.isSafeInteger(step) || step < 0 || step >= trace.frames.length) {
		throw new Error(name + " references a missing frame.");
	}
}

/** Fail explicitly on stale or ungrounded host-authored guidance. */
export function validateGuidance(trace: Trace, guidance: ThroughlineGuidance): void {
	const chapters = guidance.chapters ?? [];
	const links = guidance.causalLinks ?? [];
	if (chapters.length > 100 || links.length > 200) {
		throw new Error("Guidance exceeds the chapter or causal-link limit.");
	}
	const chapterIds = new Set<string>();
	let lastEnd = -1;
	for (const chapter of chapters) {
		assertId(chapter.id, "chapter ID", chapterIds);
		assertText(chapter.title, "Chapter title");
		if (chapter.summary !== undefined) assertText(chapter.summary, "Chapter summary");
		assertStep(chapter.start, trace, "Chapter start");
		assertStep(chapter.end, trace, "Chapter end");
		if (chapter.end < chapter.start || chapter.start <= lastEnd) {
			throw new Error("Chapters must be ordered, disjoint inclusive frame ranges.");
		}
		lastEnd = chapter.end;
	}
	const linkIds = new Set<string>();
	for (const link of links) {
		assertId(link.id, "causal-link ID", linkIds);
		for (const field of ["title", "trigger", "observedEvent", "stateChange", "consequence"] as const) {
			assertText(link[field], "Causal " + field);
		}
		assertStep(link.step, trace, "Causal link");
		if (!Array.isArray(link.evidence) || link.evidence.length === 0 || link.evidence.length > 20) {
			throw new Error("Causal link " + link.id + " needs 1–20 authored event references.");
		}
		let stateChange = false;
		for (const reference of link.evidence) {
			assertStep(reference.step, trace, "Evidence");
			if (reference.step > link.step) {
				throw new Error("Evidence for " + link.id + " cannot come from a future frame.");
			}
			const event = trace.frames[reference.step]?.events[reference.event];
			if (!Number.isSafeInteger(reference.event) || !event) {
				throw new Error("Evidence for " + link.id + " references a missing authored event.");
			}
			if (event.op === "set" || event.op === "show" || event.op === "hide") {
				stateChange = true;
			}
		}
		if (!stateChange) {
			throw new Error("Causal link " + link.id + " must cite an authored state-changing event.");
		}
	}
}

interface PlayerGuidanceProps {
	trace: Trace;
	frame: Frame;
	guidance: ThroughlineGuidance;
	onSeek: (step: number) => void;
}

/** Chapter navigation above the scene. Authored explanations stay in the caption. */
export function PlayerGuidanceControls({
	frame,
	guidance,
	onSeek,
}: PlayerGuidanceProps): React.JSX.Element | null {
	const chapterSelectId = useId();
	const chapters = guidance.chapters ?? [];
	const chapter = chapters.find((item) => frame.index >= item.start && frame.index <= item.end);
	if (!chapters.length) return null;
	return (
		<div className="thl-chapter-nav" role="group" aria-label="Chapter navigation">
			<label htmlFor={chapterSelectId}>Chapter</label>
			<select
				id={chapterSelectId}
				value={chapter?.id ?? ""}
				onChange={(event) => {
					const selected = chapters.find((item) => item.id === event.currentTarget.value);
					if (selected) onSeek(selected.start);
				}}
			>
				<option value="" disabled>Choose a chapter</option>
				{chapters.map((item) => (
					<option key={item.id} value={item.id}>{item.title}</option>
				))}
			</select>
			{chapter && (
				<button type="button" aria-label="Restart chapter" title="Restart chapter" onClick={() => onSeek(chapter.start)}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 1 2.4 5.7M4 6v6h6" /></svg>
				</button>
			)}
		</div>
	);
}

/** Read-only authored evidence and chapter description are caption content. */
export function PlayerGuidance({
	trace,
	frame,
	guidance,
}: PlayerGuidanceProps): React.JSX.Element {
	const chapters = guidance.chapters ?? [];
	const chapter = chapters.find((item) => frame.index >= item.start && frame.index <= item.end);
	const links = (guidance.causalLinks ?? []).filter((item) => item.step === frame.index);
	return (
		<section className="thl-guidance" aria-label="Guided explanation">
			{chapter && (
				<div className="thl-chapter">
					<strong>{chapter.title}</strong>
					{chapter.summary && <p>{chapter.summary}</p>}
				</div>
			)}
			{links.map((link) => (
				<div className="thl-causal-link" key={link.id}>
					<strong>{link.title}</strong>
					<dl>
						<div><dt>Trigger</dt><dd>{link.trigger}</dd></div>
						<div><dt>Observed event</dt><dd>{link.observedEvent}</dd></div>
						<div><dt>State change</dt><dd>{link.stateChange}</dd></div>
						<div><dt>Consequence</dt><dd>{link.consequence}</dd></div>
					</dl>
					<p className="thl-causal-evidence">
						Authored evidence: {link.evidence.map((evidence) => (
							"Step " + (evidence.step + 1) + " (" +
							trace.frames[evidence.step]?.label + "), event " + (evidence.event + 1)
						)).join("; ")}
					</p>
				</div>
			))}
		</section>
	);
}
