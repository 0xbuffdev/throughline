import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { compileArtifact, serializeArtifact } from "../src/index.js";
import { checkoutReference } from "../src/reference/checkout.js";
import { GraphPlayer } from "../src/react/graph-player.js";
import { MermaidPlayerDiagram } from "../src/react/mermaid/player-diagram.js";
import "../src/styles/throughline.css";
import "./style.css";

type Theme = "auto" | "light" | "dark";
type Viewport = "desktop" | "tablet" | "mobile";

const trace = compileArtifact(checkoutReference.artifact);
const source = "~~~thl\n" + serializeArtifact(checkoutReference.artifact) + "\n~~~";

function App() {
	const [theme, setTheme] = useState<Theme>("auto");
	const [viewport, setViewport] = useState<Viewport>("desktop");

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
					<GraphPlayer
						trace={trace}
						title={checkoutReference.title}
						theme={theme}
						narration
						DiagramRenderer={MermaidPlayerDiagram}
					/>
				</div>

				<section aria-label="Matched static explanation and comprehension">
					<h2>Static explanation</h2>
					<p>{checkoutReference.explanation}</p>
					<h3>Comprehension questions</h3>
					<ol>
						{checkoutReference.questions.map(question => (
							<li key={question.id}>
								<strong>{question.question}</strong>
								<p>{question.expectedAnswer}</p>
								<small>Evidence: {question.evidenceEventIds.join(", ")}</small>
							</li>
						))}
					</ol>
					<h3>Evidence limits</h3>
					<ul>
						{checkoutReference.caveats.map(text => <li key={text}>{text}</li>)}
					</ul>
				</section>

				<details className="preview-source">
					<summary>View strict schema-2 thl source</summary>
					<pre><code>{source}</code></pre>
				</details>
			</div>
		</main>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing preview mount point.");
createRoot(root).render(<StrictMode><App /></StrictMode>);
