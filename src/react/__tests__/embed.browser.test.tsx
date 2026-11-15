import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { ThroughlineEmbed } from "../index.js";
import "../../styles/throughline.css";

const artifact = (start: number, end: number) => JSON.stringify({
	schemaVersion: 2, id: "counter",
	origins: [{ id: "author", kind: "authored" }],
	entities: [{ id: "counter", label: "Counter" }], relations: [],
	initialState: { counter: { status: "known", value: start } },
	steps: [{ id: "advance", label: "Advance", events: [{
		id: "write", originId: "author", type: "write", entityId: "counter",
		path: [], value: { status: "known", value: end },
	}] }],
});
const first = artifact(0, 1);
const second = artifact(8, 9);

it("renders validated v2 artifact JSON and steps through its native player", async () => {
	const screen = await render(<ThroughlineEmbed artifactJson={first} title="Counter" />);
	await expect.element(screen.getByRole("heading", { name: "Counter" })).toBeVisible();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 2");
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 2");
});

it("memoizes unchanged JSON across presentation props and recompiles changed artifacts", async () => {
	const screen = await render(<ThroughlineEmbed artifactJson={first} theme="light" />);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await screen.rerender(<ThroughlineEmbed artifactJson={first} theme="dark" />);
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 2");
	await screen.rerender(<ThroughlineEmbed artifactJson={second} theme="dark" />);
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 2");
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 2");
});
