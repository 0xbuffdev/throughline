import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { compileArtifact } from "../../../v2/compiler.js";
import { inspectTrace } from "../../../v2/inspector.js";
import { projectView } from "../../../v2/views.js";
import { sequenceWorkload } from "./workloads.js";
import { ProofEvidence } from "./evidence.js";

it("navigates complete evidence and phase counts beyond the diagram window at the same frame", async () => {
	const trace = compileArtifact(sequenceWorkload());
	const inspector = inspectTrace(trace);
	const view = projectView(inspector, { kind: "sequence", frameIndex: 100 });
	let selected: readonly string[] | undefined;
	const screen = await render(<ProofEvidence view={view} onSelect={item => { selected = item.source.eventIds; }} />);
	await expect.element(screen.getByRole("region", { name: "Complete recorded evidence" })).toHaveTextContent("10000 recorded events");
	await expect.element(screen.getByRole("region", { name: "Complete recorded evidence" })).toHaveTextContent("5000 sent");
	expect(screen.container.querySelectorAll("tbody tr")).toHaveLength(40);
	await screen.getByRole("button", { name: "Latest evidence", exact: true }).click();
	await screen.getByRole("button", { name: "event9999", exact: true }).click();
	expect(selected).toEqual(["event9999"]);
	await screen.rerender(<ProofEvidence view={projectView(inspector, { kind: "sequence", frameIndex: 1 })}
		onSelect={() => {}} />);
	expect(screen.container.textContent).toContain("100 recorded events");
	expect(screen.container.textContent).not.toContain("event9999");
	expect(screen.container.querySelectorAll("tbody tr").length).toBeLessThanOrEqual(40);
});
