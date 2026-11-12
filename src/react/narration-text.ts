import type { Frame, Trace } from "../model.js";
import { format } from "../layout/measure.js";
import type { ThroughlineGuidance } from "./guidance.js";

/** Only authored text and authored transfers are narrated; never infer causes. */
export function narrationText(frame: Frame, trace: Trace, guidance?: ThroughlineGuidance): string {
	const segments: string[] = [frame.label, ...frame.state.notes];
	const chapter = guidance?.chapters?.find(
		(item) => frame.index >= item.start && frame.index <= item.end,
	);
	if (chapter) {
		segments.push(chapter.title);
		if (chapter.summary) segments.push(chapter.summary);
	}
	for (const item of guidance?.causalLinks ?? []) {
		if (item.step !== frame.index) continue;
		segments.push(item.title);
		segments.push("Trigger: " + item.trigger);
		segments.push("Observed event: " + item.observedEvent);
		segments.push("State change: " + item.stateChange);
		segments.push("Consequence: " + item.consequence);
	}
	for (const transfer of frame.state.transfers) {
		const relation = frame.state.relations.find((item) => item.id === transfer.relation);
		if (!relation) continue;
		segments.push(
			relation.from + " to " + relation.to +
			(transfer.value === undefined ? "" : ": " + format(transfer.value)),
		);
	}
	// Source lengths are compiler-bounded but browser speech engines have
	// varying per-utterance limits. Keep one spoken step at a safe size.
	const text = segments.filter(Boolean).join(". ").replace(/\s+/g, " ").trim();
	if (text.length <= 3000) return text;
	const suffix = " Narration shortened. Read Details for the complete explanation.";
	return text.slice(0, 3000 - suffix.length).trimEnd() + suffix;
}
