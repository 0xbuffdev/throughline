import type { Locator } from "vitest/browser";

type Screen = Pick<Locator, "getByRole">;

export async function openPlayerPanel(screen: Screen) {
	const button = screen.getByRole("button", { name: "Player options", exact: true });
	const panel = screen.getByRole("group", { name: "Player options", exact: true });
	if (!panel.query()) await button.click();
}

export async function closePlayerPanel(screen: Screen) {
	const panel = screen.getByRole("group", { name: "Player options", exact: true });
	if (panel.query()) await screen.getByRole("button", { name: "Player options", exact: true }).click();
}

export async function seekFrame(screen: Screen, frame: number) {
	await openPlayerPanel(screen);
	await screen.getByRole("spinbutton", { name: "Step number" }).fill(String(frame + 1));
	await screen.getByRole("button", { name: "Go to step" }).click();
}

export function stepCount(screen: Screen) {
	return screen.getByRole("group", { name: "Playback controls" }).element().querySelector(".thl-step-count-full");
}
