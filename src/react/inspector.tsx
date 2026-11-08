import type * as React from "react";
import type { Frame } from "../model.js";
import { visibleScene } from "../scene.js";

interface StateInspectorProps {
	frame: Frame;
}
export function StateInspector({
	frame,
}: StateInspectorProps): React.JSX.Element {
	return (
		<details className="thl-inspector">
			<summary>Inspect state</summary>
			<dl>
				{visibleScene(frame.state).entities.map((entity) => (
					<div key={entity.id}>
						<dt>
							{entity.label} <span>({entity.id})</span>
						</dt>
						<dd>
							<pre>{JSON.stringify(entity.value)}</pre>
						</dd>
					</div>
				))}
			</dl>
		</details>
	);
}
