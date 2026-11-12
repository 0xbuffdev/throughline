import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { compile } from "../src/index.js";
import { CHECKOUT_GUIDANCE, CHECKOUT_SCENARIOS, EXAMPLES } from "../src/examples.js";
import { ThroughlinePlayer, ThroughlineScenarios } from "../src/react/index.js";
import "../src/styles/throughline.css";
import "./style.css";

type Theme = "auto" | "light" | "dark";
type Viewport = "desktop" | "mobile";

const examples = EXAMPLES.map((example) => ({
	...example,
	trace: compile(example.source),
}));

const scenarios = CHECKOUT_SCENARIOS.map((item) => ({
	id: item.id,
	title: item.title,
	description: item.description,
	trace: compile(item.source),
	guidance: item.id === "retry-recovery" ? CHECKOUT_GUIDANCE : undefined,
}));

function App() {
	const [exampleId, setExampleId] = useState("reconciliation");
	const [theme, setTheme] = useState<Theme>("auto");
	const [viewport, setViewport] = useState<Viewport>("desktop");
	const current = examples.find((item) => item.id === exampleId);
	const isComparison = exampleId === "scenario-comparison";
	const source = isComparison
		? CHECKOUT_SCENARIOS.map((item) => item.title + "\n\n" + item.source).join("\n\n---\n\n")
		: (current?.source ?? "");

	return (
		<main className="preview-app" data-theme={theme}>
			<div className="preview-shell">
				<header className="preview-heading">
					<p className="preview-eyebrow">Throughline / development preview</p>
					<h1>React player review</h1>
					<p>
						Inspect the current repository source before releasing any package.
						All scenarios are authored traces, not executable payment systems.
					</p>
				</header>

				<section className="preview-toolbar" aria-label="Preview settings">
					<label htmlFor="preview-example">
						Example
						<select
							id="preview-example"
							value={exampleId}
							onChange={(event) => setExampleId(event.currentTarget.value)}
						>
							{examples.map((example) => (
								<option key={example.id} value={example.id}>{example.title}</option>
							))}
							<option value="scenario-comparison">Compare checkout outcomes</option>
						</select>
					</label>
					<label htmlFor="preview-theme">
						Theme
						<select
							id="preview-theme"
							value={theme}
							onChange={(event) => setTheme(event.currentTarget.value as Theme)}
						>
							<option value="auto">System</option>
							<option value="light">Light</option>
							<option value="dark">Dark</option>
						</select>
					</label>
					<label htmlFor="preview-width">
						Viewport
						<select
							id="preview-width"
							value={viewport}
							onChange={(event) => setViewport(event.currentTarget.value as Viewport)}
						>
							<option value="desktop">Responsive desktop</option>
							<option value="mobile">375px mobile</option>
						</select>
					</label>
				</section>

				<div className="preview-frame" data-width={viewport}>
					{isComparison ? (
						<ThroughlineScenarios
							key="scenario-comparison"
							scenarios={scenarios}
							initialScenarioId="retry-recovery"
							theme={theme}
							sonification={{}}
						/>
					) : current ? (
						<ThroughlinePlayer
							key={current.id}
							trace={current.trace}
							title={current.title}
							theme={theme}
							sonification={{}}
							guidance={current.id === "distributed-checkout" ? CHECKOUT_GUIDANCE : undefined}
						/>
					) : null}
				</div>

				<details className="preview-source">
					<summary>View authored trace source</summary>
					<pre><code>{source}</code></pre>
				</details>
				<p className="preview-footnote">
					Use the player controls to step, pan, zoom, collapse groups, inspect state
					and switch outcomes. Sound is available in every example: select the speaker
					icon to unmute, then Play or step forward to hear short synthesized tones.
					It starts muted and does not narrate the workflow. Resize the browser or
					choose the 375px view to find layout problems. Changes to the source reload
					this local preview.
				</p>
			</div>
		</main>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing preview mount point.");
createRoot(root).render(<StrictMode><App /></StrictMode>);
