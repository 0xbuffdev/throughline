import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compileArtifact } from "../../v2/compiler.js";
import { factorialReference } from "../../reference/factorial.js";
import { ThroughlineGraphPlayer } from "../graph-player.js";
import "../../styles/throughline.css";

it("keeps the overview scale and shows compact stack summaries instead of JSON", async () => {
 const trace = compileArtifact(factorialReference.artifact);
 const screen = await render(<ThroughlineGraphPlayer trace={trace}/>);
 const shell = screen.getByRole("group", { name: "Visualization player" }).element();
 for (const width of [900, 375, 260]) {
  shell.style.width = width + "px";
  shell.focus();
  await userEvent.keyboard("{Home}");
  await expect.poll(() => Number(shell.querySelector("svg.graph")?.getAttribute("viewBox")?.split(" ")[2])).toBe(width - 2);
  const overview = shell.querySelector("svg.graph")!.getAttribute("viewBox");
  for (let index = 1; index <= 4; index++) {
   await screen.getByRole("button", { name: "Step forward" }).click();
   expect(shell.querySelector('[data-node="stack"] .thl-v2-value')?.textContent)
    .toBe(index + (index === 1 ? " item" : " items"));
   expect(shell.querySelector("svg.graph")?.getAttribute("viewBox")?.split(" ")[2]).toBe(overview!.split(" ")[2]);
   expect(shell.querySelector('[data-node="stack"] .thl-v2-value')?.textContent).not.toContain("waitingFor");
  }
 }
});

it("uses a compact evidence scale and contains long source values at narrow embed widths", async () => {
 await page.viewport(1200, 900);
 const source = structuredClone(factorialReference.artifact);
 source.initialState.stack = { status: "known", value: [{ long: "x".repeat(2400), nested: { key: null } }] };
 const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(source)}/>);
 const shell = screen.getByRole("group", { name: "Visualization player" }).element();
 shell.style.width = "375px";
 await screen.getByRole("button", { name: "Select Modeled call stack", exact: true }).click();
 await screen.getByText("Changes and evidence", { exact: true }).click();
 const panel = screen.getByRole("complementary", { name: "Entity inspector" }).element();
 for (const width of [900, 375, 260]) {
  shell.style.width = width + "px";
  await expect.poll(() => Math.round(shell.getBoundingClientRect().width)).toBe(width);
  const evidence = panel.querySelector<HTMLElement>(".thl-v2-inspect")!;
  for (const element of evidence.querySelectorAll<HTMLElement>("h3,h4,h5,p,label,button,code,td")) {
   expect(parseFloat(getComputedStyle(element).fontSize)).toBeLessThanOrEqual(13);
   expect(parseFloat(getComputedStyle(element).fontSize)).toBeGreaterThanOrEqual(11);
  }
  expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1);
  expect(shell.scrollWidth).toBeLessThanOrEqual(shell.clientWidth + 1);
  for (const table of evidence.querySelectorAll("table"))
   expect(table.parentElement?.classList.contains("thl-v2-inspect-table-wrap")).toBe(true);
 }
 expect(panel.querySelector(".current-value")?.textContent).not.toContain("x".repeat(100));
 await screen.getByRole("button", { name: /Show exact current value of stack/ }).click();
 const exact = screen.getByRole("region", { name: "Exact current value of stack", exact: true });
 await expect.element(exact).toBeVisible();
 expect(exact.element().querySelector("pre")!.textContent.length).toBeLessThanOrEqual(1024);
 expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1);
});

it("browses structured fields without mounting a large tree or omitting exact source data", async () => {
 const source = structuredClone(factorialReference.artifact);
 source.initialState.stack = { status: "known", value: Array.from({ length: 20 }, (_, n) => ({ n, call: `factorial(${n})` })) };
 const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(source)}/>);
 await screen.getByRole("button", { name: "Select Modeled call stack", exact: true }).click();
 const panel = screen.getByRole("complementary", { name: "Entity inspector" }).element();
 const root = panel.querySelector<HTMLDetailsElement>(".current-value .value-tree")!;
 expect(root.querySelector("dl")).toBeNull();
 await screen.getByText("Browse fields", { exact: true }).click();
 expect(root.querySelectorAll(":scope > dl > div")).toHaveLength(8);
 await screen.getByRole("button", { name: "Next fields", exact: true }).click();
 expect(root.querySelector(":scope > dl > div > dt")?.textContent).toBe("[8]");
 expect(root.querySelectorAll(":scope > dl > div")).toHaveLength(8);
 const first = root.querySelector<HTMLDetailsElement>("dl .value-tree")!;
 first.open = true;
 await expect.poll(() => first.textContent).toContain('"factorial(8)"');
 await screen.getByRole("button", { name: /Show exact current value of stack/ }).click();
 expect(screen.getByRole("region", { name: "Exact current value of stack" }).element().textContent)
  .toContain('"factorial(19)"');
});
