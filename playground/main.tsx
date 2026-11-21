import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { compileArtifact, serializeArtifact } from "../src/index.js";
import { EXAMPLES } from "../src/examples.js";
import { GraphPlayer } from "../src/react/graph-player.js";
import { MermaidPlayerDiagram } from "../src/react/mermaid/player-diagram.js";
import "../src/styles/throughline.css";
import "./style.css";

type Theme = "auto" | "light" | "dark";
type Viewport = "desktop" | "tablet" | "mobile";

const examples = EXAMPLES.map(example => ({
	...example,
	trace: compileArtifact(example.artifact),
	source: "~~~thl\n" + serializeArtifact(example.artifact) + "\n~~~",
}));

function App() {
	const [exampleId, setExampleId] = useState("factorial");
	const [theme, setTheme] = useState<Theme>("auto");
	const [viewport, setViewport] = useState<Viewport>("desktop");
	const current = examples.find(example => example.id === exampleId);

	return (
		<main className="preview-app" data-theme={theme}>
			<div className="preview-shell">
				<header className="preview-heading">
					<p className="preview-eyebrow">Throughline / schema-2 development preview</p>
					<h1>Throughline player preview</h1>
					<p>
						Try the Mermaid Graph and Sequence views with the compact player.
					</p>
				</header>

				<section className="preview-toolbar" aria-label="Preview settings">
					<label htmlFor="preview-example">
						Reference model
						<select
							id="preview-example"
							value={exampleId}
							onChange={event => setExampleId(event.currentTarget.value)}
						>
							{examples.map(example =>
								<option key={example.id} value={example.id}>{example.title}</option>)}
						</select>
					</label>
					<label htmlFor="preview-theme">
						Theme
						<select id="preview-theme" value={theme}
							onChange={event => setTheme(event.currentTarget.value as Theme)}>
							<option value="auto">System</option>
							<option value="light">Light</option>
							<option value="dark">Dark</option>
						</select>
					</label>
					<label htmlFor="preview-width">
						Viewport
						<select id="preview-width" value={viewport}
							onChange={event => setViewport(event.currentTarget.value as Viewport)}>
							<option value="desktop">Responsive desktop</option>
							<option value="tablet">768px tablet</option>
							<option value="mobile">375px mobile</option>
						</select>
					</label>
				</section>

				<div className="preview-frame" data-width={viewport}>
					{current ? (
						<GraphPlayer
							key={current.id}
							trace={current.trace}
							title={current.title}
							theme={theme}
							narration
							DiagramRenderer={MermaidPlayerDiagram}
						/>
					) : null}
				</div>

				{current && (
					<section aria-label="Matched static explanation and comprehension">
						<h2>Static explanation</h2>
						<p>{current.explanation}</p>
						<h3>Comprehension questions</h3>
						<ol>
							{current.questions.map(question => (
								<li key={question.id}>
									<strong>{question.question}</strong>
									<p>{question.expectedAnswer}</p>
									<small>Evidence: {question.evidenceEventIds.join(", ")}</small>
								</li>
							))}
						</ol>
						<h3>Evidence limits</h3>
						<ul>
							{current.caveats.map(text => <li key={text}>{text}</li>)}
						</ul>
					</section>
				)}

				<details className="preview-source">
					<summary>View strict schema-2 thl source</summary>
					<pre><code>{current?.source ?? ""}</code></pre>
				</details>
				<p className="preview-footnote">
					Select a reference model above, then use the player tabs for Graph,
          Sequence, or State. The Inspect sidebar provides complete source
          evidence and histories. The static explanation and questions are
          a matched baseline, not a measured learning-outcome claim.
				</p>
			</div>
		</main>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing preview mount point.");
createRoot(root).render(<StrictMode><App /></StrictMode>);
