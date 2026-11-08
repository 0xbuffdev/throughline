import type * as React from "react";
import { format } from "../layout/measure.js";
import type { Frame } from "../model.js";

interface PlayerCaptionProps {
	frame: Frame;
	id: string;
}
export function PlayerCaption({
	frame,
	id,
}: PlayerCaptionProps): React.JSX.Element {
	return (
		<div className="thl-caption" id={id}>
			<span className="thl-step">
				{String(frame.index + 1).padStart(2, "0")}
			</span>
			<div>
				<p>
					<strong>{frame.label}</strong>
					{frame.state.notes.length > 0 && (
						<span>{frame.state.notes.join(" ")}</span>
					)}
				</p>
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
			</div>
		</div>
	);
}
