import type { Locator } from "vitest/browser";

type Screen = Pick<Locator, "getByRole">;

export async function openPlayerPanel(screen: Screen, name: "Player options" | "View") {
	const button = screen.getByRole("button", { name, exact: true });
	const panel = screen.getByRole("group", { name: name === "View" ? "Diagram view" : name, exact: true });
	if (!panel.query()) await button.click();
}

export async function seekFrame(screen: Screen, frame: number) {
	await openPlayerPanel(screen, "Player options");
	await screen.getByRole("spinbutton", { name: "Step number" }).fill(String(frame + 1));
	await screen.getByRole("button", { name: "Go to step" }).click();
}

export function stepCount(screen: Screen) {
	return screen.getByRole("group", { name: "Playback controls" }).element().querySelector(".thl-step-count-full");
}
