import type * as React from "react";
import { useId, useState } from "react";
import type { Trace } from "../model.js";
import type { ThroughlineGuidance } from "./guidance.js";
import { ThroughlinePlayer, type ThroughlinePlayerProps } from "./player.js";

/** Independent traces; no event, frame or playback state is shared between options. */
export interface ThroughlineScenario {
	id: string;
	title: string;
	description?: string;
	trace: Trace;
	guidance?: ThroughlineGuidance;
}

export interface ThroughlineScenariosProps
	extends Omit<ThroughlinePlayerProps, "trace" | "title" | "guidance"> {
	scenarios: readonly ThroughlineScenario[];
	initialScenarioId?: string;
}

/**
 * A native scenario selector mounts one player at a time. Distinct keys reset
 * timeline, camera, sound and chapter context when switching outcomes.
 */
export function ThroughlineScenarios({
	scenarios,
	initialScenarioId,
	...playerProps
}: ThroughlineScenariosProps): React.JSX.Element {
	const selectId = useId();
	const [selectedId, setSelectedId] = useState(initialScenarioId ?? scenarios[0]?.id ?? "");
	const ids = new Set<string>();
	for (const scenario of scenarios) {
		if (!scenario.id || ids.has(scenario.id)) {
			throw new Error("Scenario IDs must be nonempty and unique.");
		}
		if (typeof scenario.title !== "string" || !scenario.title.trim()) {
			throw new Error("Each scenario needs a title.");
		}
		ids.add(scenario.id);
	}
	if (initialScenarioId !== undefined && !ids.has(initialScenarioId)) {
		throw new Error("The initial scenario ID does not exist.");
	}
	const current = scenarios.find((scenario) => scenario.id === selectedId) ?? scenarios[0];
	return (
		<div className="thl-scenarios" role="group" aria-label="Scenario comparison">
			{current ? (
				<>
					<div className="thl-scenario-picker">
						<label htmlFor={selectId}>Scenario</label>
						<select
							id={selectId}
							value={current.id}
							onChange={(event) => setSelectedId(event.currentTarget.value)}
						>
							{scenarios.map((scenario) => (
								<option key={scenario.id} value={scenario.id}>{scenario.title}</option>
							))}
						</select>
					</div>
					{current.description && (
						<p className="thl-scenario-description">{current.description}</p>
					)}
					<ThroughlinePlayer
						key={current.id}
						{...playerProps}
						trace={current.trace}
						title={current.title}
						guidance={current.guidance}
					/>
				</>
			) : (
				<p className="thl-scenario-empty">No scenarios available.</p>
			)}
		</div>
	);
}
