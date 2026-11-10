import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compile } from "../../domains/registry.js";
import { ThroughlinePlayer } from "../index.js";
import "../../styles/throughline.css";

const svg = (): SVGSVGElement => document.querySelector<SVGSVGElement>(".thl-scene")!;
const view = (): number[] => svg().getAttribute("viewBox")!.split(" ").map(Number);
const center = () => {
  const [x, y, w, h] = view();
  return { x: x + w / 2, y: y + h / 2 };
};
const dense = compile([
  "```thl flow",
  ...Array.from({ length: 32 }, (_, i) => 'node n' + i + ' "Node ' + i + '" = ' + i),
  "```",
].join("\n"));

const worldCenter = (id: string) => {
  const node = svg().querySelector<SVGGElement>('[data-node="' + id + '"]')!;
  const position = /^translate\(([-.\d]+),([-.\d]+)\)$/.exec(node.getAttribute("transform")!)!;
  const rect = node.querySelector<SVGRectElement>("rect")!;
  return {
    x: Number(position[1]) + Number(rect.getAttribute("width")) / 2,
    y: Number(position[2]) + Number(rect.getAttribute("height")) / 2,
  };
};

it("fits the full vertically dense diagram inside a bounded physical phone viewport", async () => {
  await page.viewport(375, 900);
  const screen = await render(<ThroughlinePlayer trace={dense} />);
  await expect.poll(() => view()[2]).toBeLessThan(720);
  await expect.poll(() => view()[3]).toBeGreaterThan(900);
  const rect = svg().getBoundingClientRect();
  expect(rect.height).toBeLessThanOrEqual(513);
  expect(rect.width).toBeLessThan(375);
  expect(svg().getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
  await screen.getByRole("button", { name: "Zoom in" }).click();
  await screen.getByRole("button", { name: "Fit to view" }).click();
  const [x, y, width, height] = view();
  expect(x).toBe(0);
  expect(y).toBe(0);
  // Both world corners project inside the *physical* SVG viewport.
  const matrix = svg().getScreenCTM()!;
  const topLeft = new DOMPoint(0, 0).matrixTransform(matrix);
  const bottomRight = new DOMPoint(width, height).matrixTransform(matrix);
  expect(topLeft.x).toBeGreaterThanOrEqual(rect.left - 1);
  expect(topLeft.y).toBeGreaterThanOrEqual(rect.top - 1);
  expect(bottomRight.x).toBeLessThanOrEqual(rect.right + 1);
  expect(bottomRight.y).toBeLessThanOrEqual(rect.bottom + 1);
});

it("centers selectable entities at left, right, top and bottom edges at 1x zoom", async () => {
  await page.viewport(375, 900);
  const screen = await render(<ThroughlinePlayer trace={dense} />);
  await expect.poll(() => view()[2]).toBeLessThan(720);
  const ids = ["n0", "n1", "n30", "n31"];
  const positions = ids.map(worldCenter);
  expect(positions[0].x).toBeLessThan(positions[1].x);
  expect(positions[0].y).toBeLessThan(positions[3].y);
  const menu = screen.getByRole("combobox", { name: "Select entity" }).element();
  for (const [index, id] of ids.entries()) {
    await userEvent.selectOptions(menu, id);
    const desired = positions[index];
    await expect.poll(() => center().x).toBeCloseTo(desired.x, 3);
    await expect.poll(() => center().y).toBeCloseTo(desired.y, 3);
    expect(view()[2]).toBeGreaterThan(0);
  }
});

it("pinches while translating the two-finger midpoint without anchor drift", async () => {
  await page.viewport(375, 850);
  await render(<ThroughlinePlayer trace={compile([
    "```thl flow",
    'node a "A" = 1',
    'node b "B" = 2',
    "```",
  ].join("\n"))} />);
  await expect.poll(() => view()[2]).toBeLessThan(720);
  const rect = svg().getBoundingClientRect();
  const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const inverse = svg().getScreenCTM()!.inverse();
  const worldAnchor = new DOMPoint(start.x, start.y).matrixTransform(inverse);
  const fire = (type: string, id: number, dx: number) =>
    svg().dispatchEvent(new PointerEvent(type, {
      bubbles: true, pointerId: id, pointerType: "touch",
      isPrimary: id === 91, clientX: start.x + dx, clientY: start.y,
    }));
  // Distance 100 -> 150 px while midpoint moves +50 px.
  fire("pointerdown", 91, -50);
  fire("pointerdown", 92, 50);
  fire("pointermove", 91, -25);
  fire("pointermove", 92, 125);
  await expect.poll(() => view()[2]).toBeLessThan(rect.width);
  const shifted = new DOMPoint(worldAnchor.x, worldAnchor.y).matrixTransform(svg().getScreenCTM()!);
  expect(shifted.x - start.x).toBeGreaterThan(48);
  expect(shifted.x - start.x).toBeLessThan(52);
  expect(Math.abs(shifted.y - start.y)).toBeLessThan(2);
  fire("pointerup", 92, 125);
  fire("pointerup", 91, -25);
});

it("preserves normal wheel scrolling at zoom limits and Ctrl/Meta browser zoom", async () => {
  const screen = await render(<ThroughlinePlayer trace={dense} />);
  await expect.poll(() => view()[2]).toBeLessThan(720);
  const rect = svg().getBoundingClientRect();
  const dispatchWheel = (deltaY: number, modifiers: { ctrlKey?: boolean; metaKey?: boolean } = {}) => {
    const event = new WheelEvent("wheel", {
      bubbles: true, cancelable: true, deltaY, ...modifiers,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
    svg().dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(dispatchWheel(100)).toBe(false); // Already at minimum zoom.
  expect(dispatchWheel(-100, { ctrlKey: true })).toBe(false);
  expect(dispatchWheel(-100, { metaKey: true })).toBe(false);
  const overviewWidth = view()[2];
  expect(dispatchWheel(-100)).toBe(true);
  await expect.poll(() => view()[2]).toBeLessThan(overviewWidth);
  const zoomIn = screen.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < 8; i++) {
    if (zoomIn.element().hasAttribute("disabled")) break;
    await zoomIn.click();
  }
  await expect.element(zoomIn).toBeDisabled();
  expect(dispatchWheel(-100)).toBe(false); // Already at maximum zoom.
  expect(dispatchWheel(100, { ctrlKey: true })).toBe(false);
  expect(dispatchWheel(100)).toBe(true);
});
