import { expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compile } from "../../domains/registry.js";
import { CHECKOUT_GUIDANCE, CHECKOUT_SCENARIOS } from "../../examples.js";
import { ThroughlinePlayer, ThroughlineScenarios } from "../index.js";
import "../../styles/throughline.css";

const scenarios = CHECKOUT_SCENARIOS.map((item) => ({
	id: item.id,
	title: item.title,
	description: item.description,
	trace: compile(item.source),
	guidance: item.id === "retry-recovery" ? CHECKOUT_GUIDANCE : undefined,
}));

it("navigates authored chapters and shows evidence without inventing events", async () => {
	const trace = compile(CHECKOUT_SCENARIOS[2].source);
	const screen = await render(<ThroughlinePlayer trace={trace} guidance={CHECKOUT_GUIDANCE} />);
	await expect.element(screen.getByRole("combobox", { name: "Chapter" })).toHaveValue("request");
	await screen.getByRole("combobox", { name: "Chapter" }).selectOptions("retry");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Chapter: Idempotent retry");
	await expect.element(screen.getByRole("slider", { name: "Timeline" }))
		.toHaveAttribute("aria-valuetext", "Step 10 of 17");

	await screen.getByRole("slider", { name: "Timeline" }).fill("8");
	await expect.element(screen.getByRole("status")).toHaveTextContent(
		"Authored explanation: Why a timeout is not a decline",
	);
	expect(document.querySelector(".thl-causal-link")?.textContent).toContain(
		"Step 8 (Provider records charge), event 1",
	);
	expect(document.querySelector(".thl-causal-link")?.textContent).toContain(
		"Step 9 (Timeout without confirmation), event 1",
	);
	expect(document.querySelector(".thl-causal-link")?.textContent).toContain(
		"the receipt remains unconfirmed",
	);
	await screen.getByRole("slider", { name: "Timeline" }).fill("7");
	expect(document.querySelector(".thl-causal-link")).toBeNull();
	await screen.getByRole("slider", { name: "Timeline" }).fill("14");
	expect(document.querySelector(".thl-causal-link")?.textContent).toContain(
		"The local receipt is explicitly updated to paid.",
	);
	expect(document.querySelector('[data-node="receipt"] .thl-cell text')?.textContent)
		.toBe("paid: pay-ord-1042");
});

it("switches independent outcomes with no prior timeline, speed or scene leakage", async () => {
	const screen = await render(<ThroughlineScenarios scenarios={scenarios} />);
	const picker = screen.getByRole("combobox", { name: "Scenario" });
	await expect.element(picker).toHaveValue("success");
	const slider = screen.getByRole("slider", { name: "Timeline" });
	await slider.fill("5");
	await screen.getByRole("combobox", { name: "Playback speed" }).selectOptions("2");
	expect(document.querySelector('[data-node="ledger"] .thl-cell text')?.textContent).toBe("paid");

	await picker.selectOptions("terminal-failure");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 6");
	await expect.element(screen.getByRole("combobox", { name: "Playback speed" })).toHaveValue("1");
	expect(document.querySelector('[data-node="ledger"] .thl-cell text')?.textContent).toBe("unconfirmed");
	await screen.getByRole("slider", { name: "Timeline" }).fill("5");
	expect(document.querySelector('[data-node="ledger"] .thl-cell text')?.textContent).toBe("failed");

	await picker.selectOptions("retry-recovery");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 17");
	await expect.element(screen.getByRole("combobox", { name: "Chapter" })).toHaveValue("request");
	expect(document.querySelector(".thl-scenario-description")?.textContent).toContain("lost acknowledgement");
	await picker.selectOptions("success");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 6");
	expect(document.querySelector(".thl-guidance")).toBeNull();
	expect(document.querySelector('[data-node="ledger"] .thl-cell text')?.textContent).toBe("unconfirmed");
});

it("keeps authored text as text and fits the chapter/scenario controls on mobile", async () => {
	await page.viewport(375, 900);
	const guide = {
		chapters: [{ id: "overview", title: "Overview", start: 0, end: 0 }],
		causalLinks: [{
			id: "unsafe-label",
			title: "<img src=x onerror=alert(1)>",
			step: 1,
			trigger: "<script>not executed</script>",
			observedEvent: "A trace event",
			stateChange: "The ledger changed",
			consequence: "No code is executed",
			evidence: [{ step: 1, event: 1 }],
		}],
	};
	const screen = await render(<ThroughlineScenarios scenarios={[
		{ ...scenarios[0], guidance: guide },
		...scenarios.slice(1),
	]} />);
	await screen.getByRole("slider", { name: "Timeline" }).fill("1");
	expect(document.querySelector(".thl-guidance img")).toBeNull();
	expect(document.querySelector(".thl-guidance script")).toBeNull();
	expect(document.querySelector(".thl-guidance")?.textContent).toContain(
		"<script>not executed</script>",
	);
	const wrapper = document.querySelector(".thl-scenarios") as HTMLElement;
	expect(wrapper.scrollWidth).toBeLessThanOrEqual(wrapper.clientWidth);
});


it("restarts an already-selected chapter and pauses playback", async () => {
	const trace = compile(CHECKOUT_SCENARIOS[2].source);
	const screen = await render(<ThroughlinePlayer trace={trace} guidance={CHECKOUT_GUIDANCE} />);
	const timeline = screen.getByRole("slider", { name: "Timeline" });
	const chapter = screen.getByRole("combobox", { name: "Chapter" });

	await timeline.fill("3");
	await expect.element(chapter).toHaveValue("request");
	await expect.element(timeline).toHaveAttribute("aria-valuetext", "Step 4 of 17");
	await screen.getByRole("button", { name: "Play", exact: true }).click();
	await expect.element(screen.getByRole("button", { name: "Pause" })).toBeEnabled();

	await screen.getByRole("button", { name: "Restart chapter" }).click();
	await expect.element(timeline).toHaveAttribute("aria-valuetext", "Step 1 of 17");
	await expect.element(chapter).toHaveValue("request");
	await expect.element(screen.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
});

it("reconciles a removed scenario without restoring it when reinserted", async () => {
	const screen = await render(<ThroughlineScenarios scenarios={scenarios.slice(0, 2)} />);
	const picker = screen.getByRole("combobox", { name: "Scenario" });
	await picker.selectOptions("terminal-failure");
	await screen.getByRole("slider", { name: "Timeline" }).fill("5");
	await expect.element(picker).toHaveValue("terminal-failure");

	await screen.rerender(<ThroughlineScenarios scenarios={scenarios.slice(0, 1)} />);
	await expect.element(picker).toHaveValue("success");
	await expect.element(screen.getByRole("slider", { name: "Timeline" }))
		.toHaveAttribute("aria-valuetext", "Step 1 of 6");

	await screen.rerender(<ThroughlineScenarios scenarios={scenarios.slice(0, 2)} />);
	await expect.element(picker).toHaveValue("success");
	await screen.getByRole("slider", { name: "Timeline" }).fill("3");
	await screen.rerender(<ThroughlineScenarios scenarios={[...scenarios.slice(0, 2)]} />);
	await expect.element(picker).toHaveValue("success");
	await expect.element(screen.getByRole("slider", { name: "Timeline" }))
		.toHaveAttribute("aria-valuetext", "Step 4 of 6");

	await screen.rerender(<ThroughlineScenarios scenarios={[]} />);
	await expect.element(screen.getByText("No scenarios available.")).toBeInTheDocument();
	await screen.rerender(<ThroughlineScenarios scenarios={scenarios.slice(1, 2)} />);
	await expect.element(screen.getByRole("combobox", { name: "Scenario" }))
		.toHaveValue("terminal-failure");
	await expect.element(screen.getByRole("slider", { name: "Timeline" }))
		.toHaveAttribute("aria-valuetext", "Step 1 of 6");
	await screen.rerender(<ThroughlineScenarios scenarios={scenarios.slice(0, 2)} />);
	await expect.element(screen.getByRole("combobox", { name: "Scenario" }))
		.toHaveValue("terminal-failure");
});

it("treats initialScenarioId as an initial-only selection when the host later removes it", async () => {
	const screen = await render(
		<ThroughlineScenarios scenarios={scenarios.slice(0, 2)} initialScenarioId="terminal-failure" />,
	);
	await expect.element(screen.getByRole("combobox", { name: "Scenario" }))
		.toHaveValue("terminal-failure");
	await screen.rerender(
		<ThroughlineScenarios scenarios={scenarios.slice(0, 1)} initialScenarioId="terminal-failure" />,
	);
	await expect.element(screen.getByRole("combobox", { name: "Scenario" }))
		.toHaveValue("success");
	await screen.rerender(
		<ThroughlineScenarios scenarios={scenarios.slice(0, 2)} initialScenarioId="terminal-failure" />,
	);
	await expect.element(screen.getByRole("combobox", { name: "Scenario" }))
		.toHaveValue("success");
});
