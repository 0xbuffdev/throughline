import type * as React from "react";
import { format } from "../layout/measure.js";
import type { Frame, Trace } from "../model.js";
import { PlayerGuidance, type ThroughlineGuidance } from "./guidance.js";
import { StateInspector } from "./inspector.js";

interface PlayerCaptionProps {
	frame: Frame;
	trace: Trace;
	guidance?: ThroughlineGuidance;
	onSeek: (step: number) => void;
	id: string;
	total: number;
}
export function PlayerCaption({
	frame,
	trace,
	guidance,
	onSeek,
	id,
	total,
}: PlayerCaptionProps): React.JSX.Element {
	return (
		<div className="thl-caption" id={id}>
			<div className="thl-caption-content">
				<strong className="thl-caption-title">{frame.label}</strong>
				{frame.state.notes.length > 0 && (
					<p className="thl-caption-note">{frame.state.notes.join(" ")}</p>
				)}
				{frame.state.transfers.length > 0 && (
					<ul className="thl-transfers" aria-label="Transfers">
						{frame.state.transfers.map((transfer, index) => {
							const link = frame.state.relations.find(
								(relation) => relation.id === transfer.relation,
							);
							return (
								// biome-ignore lint/suspicious/noArrayIndexKey: transfers are stateless entries; identical sends may repeat within one frame.
								<li key={`${transfer.relation}:${index}`}>
									{link ? `${link.from} → ${link.to}` : transfer.relation}
									{transfer.value !== undefined && (
										<code>{format(transfer.value)}</code>
									)}
								</li>
							);
						})}
					</ul>
				)}
				{guidance && <PlayerGuidance trace={trace} frame={frame} guidance={guidance} onSeek={onSeek} />}
				<StateInspector frame={frame} />
			</div>
			<span className="thl-step-count">
				Step {frame.index + 1} of {total}
			</span>
		</div>
	);
}
