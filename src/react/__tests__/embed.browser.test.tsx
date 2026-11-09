import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { ThroughlineEmbed } from "../index.js";
import "../../styles/throughline.css";

const first = 'thl flow\nnode counter "Counter" = 0\nstep "One"\n  set counter = 1';
const second = 'thl flow\nnode counter "Counter" = 8\nstep "Nine"\n  set counter = 9';

it("renders a source-backed trace and steps through the existing accessible player", async () => {
	const screen = await render(<ThroughlineEmbed source={first} title="Counter" />);
	await expect.element(screen.getByRole("heading", { name: "Counter" })).toBeVisible();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 2");
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 2");
});

it("memoizes unchanged source across presentation changes and resets on new source", async () => {
	const screen = await render(<ThroughlineEmbed source={first} theme="light" />);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await screen.rerender(<ThroughlineEmbed source={first} theme="dark" />);
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 2");
	await screen.rerender(<ThroughlineEmbed source={second} theme="dark" />);
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 2");
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 2");
	expect(document.querySelector('[data-node="counter"] .thl-cell text')?.textContent)
		.toBe("9");
});
