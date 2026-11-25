import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compileArtifact } from "../../v2/compiler.js";
import { retryCheckout } from "../../__tests__/v2-sequence-fixture.js";
import { ThroughlineGraphPlayer } from "../graph-player.js";
import "../../styles/throughline.css";

it("uses automatic roving tab activation and leaves the tablist with Tab", async () => {
 const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(retryCheckout())} initialView="graph"/>);
 const graph = screen.getByRole("tab", { name: "Graph" });
 const sequence = screen.getByRole("tab", { name: "Sequence" });
 const state = screen.getByRole("tab", { name: "State" });
 graph.element().focus();
 await userEvent.keyboard("{ArrowRight}");
 await expect.element(sequence).toHaveFocus();
 await expect.element(sequence).toHaveAttribute("aria-selected", "true");
 await userEvent.keyboard("{End}");
 await expect.element(state).toHaveFocus();
 await expect.element(state).toHaveAttribute("aria-selected", "true");
 await userEvent.keyboard("{Home}");
 await expect.element(graph).toHaveFocus();
 await expect.element(graph).toHaveAttribute("tabindex", "0");
 await userEvent.keyboard("{Tab}");
 expect(document.activeElement?.getAttribute("role")).not.toBe("tab");
 await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
 await expect.element(graph).toHaveFocus();
});

it("invalidates native transfer motion on same-frame seek and speed change", async () => {
 const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(retryCheckout())} initialView="graph"/>);
 const player = screen.getByRole("group", { name: "Visualization player" });
 const animated = () => player.element().querySelector(".thl-link.thl-animate");
 await screen.getByRole("button", { name: "Step forward" }).click();
 expect(animated()).not.toBeNull();
 const options = screen.getByRole("button", { name: "Player options" });
 await options.click();
 await screen.getByRole("button", { name: "Go", exact: true }).click();
 expect(animated()).toBeNull();
 await screen.getByRole("button", { name: "Step back" }).click();
 await screen.getByRole("button", { name: "Step forward" }).click();
 expect(animated()).not.toBeNull();
 await screen.getByRole("button", { name: "Playback speed 1x" }).click();
 expect(animated()).toBeNull();
});

it("does not overwrite a dirty go-to-step field while autoplay advances", async () => {
 const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(retryCheckout())}/>);
 await screen.getByRole("button", { name: "Play", exact: true }).click();
 await screen.getByRole("button", { name: "Player options" }).click();
 const input = screen.getByRole("spinbutton", { name: "Go to step" });
 await input.fill("8");
 await expect.poll(() => screen.getByRole("status").element().textContent, { timeout: 5000 }).toContain("Step 2 of 10");
 await expect.element(input).toHaveValue(8);
 await screen.getByRole("button", { name: "Go", exact: true }).click();
 await expect.element(screen.getByRole("status")).toHaveTextContent("Step 8 of 10");
});

it("keeps camera geometry finite with repeated authored focus IDs", async () => {
 const source = retryCheckout();
 source.steps[0].focusEntityIds = Array.from({ length: 10000 }, () => "client");
 const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(source)} initialView="graph"/>);
 await screen.getByRole("button", { name: "Follow active" }).click();
 await screen.getByRole("button", { name: "Step forward" }).click();
 const svg = screen.getByRole("img", { name: "Source-linked graph at current frame" }).element();
 const values = svg.getAttribute("viewBox")!.split(" ").map(Number);
 expect(values).toHaveLength(4);
 expect(values.every(Number.isFinite)).toBe(true);
 expect(source.steps[0].focusEntityIds).toHaveLength(10000);
});

it("cancels active native transfer motion when autoplay is paused", async () => {
 const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(retryCheckout())} initialView="graph"/>);
 const player = screen.getByRole("group", { name: "Visualization player" });
 await screen.getByRole("button", { name: "Play", exact: true }).click();
 await expect.poll(() => player.element().querySelector(".thl-link.thl-animate"), { timeout: 5000 }).not.toBeNull();
 await screen.getByRole("button", { name: "Pause", exact: true }).click();
 expect(player.element().querySelector(".thl-link.thl-animate")).toBeNull();
 await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 10");
});


it("discards a dirty seek draft when a same-length trace is replaced", async () => {
 const first = compileArtifact(retryCheckout());
 const source = retryCheckout();
 source.steps[0].label = "Replacement request";
 const replacement = compileArtifact(source);
 expect(replacement.frames.length).toBe(first.frames.length);
 const screen = await render(<ThroughlineGraphPlayer trace={first}/>);
 await screen.getByRole("button", { name: "Step forward" }).click();
 const options = screen.getByRole("button", { name: "Player options" });
 await options.click();
 const input = screen.getByRole("spinbutton", { name: "Go to step" });
 await input.fill("8");
 await expect.element(input).toHaveValue(8);
 await screen.rerender(<ThroughlineGraphPlayer trace={replacement}/>);
 await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 10");
 await expect.element(input).toHaveValue(1);
 await screen.getByRole("button", { name: "Go", exact: true }).click();
 await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 10");
 await screen.getByRole("button", { name: "Step forward" }).click();
 await expect.element(screen.getByRole("status")).toHaveTextContent("Replacement request");
});
