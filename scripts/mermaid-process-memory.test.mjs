import { test } from "node:test";
import assert from "node:assert/strict";
import { processTreeRss, sampleProcessMemory } from "./mermaid-process-memory.mjs";
test("sums only the measurement process tree and excludes the sampler", () => {
 assert.deepEqual(processTreeRss("1 0 10 init\n10 1 20 node\n11 10 30 browser\n12 11 40 renderer\n13 10 5 ps\n20 1 1000 unrelated", 10), { rssBytes: 90 * 1024, processes: 3 });
 assert.throws(() => processTreeRss("1 0 10 init", 10), /root not present/);
});
test("stopping twice returns the same report", () => {
 const monitor = sampleProcessMemory(), report = monitor.stop();
 assert.equal(monitor.stop(), report);
 assert.equal(typeof report.available, "boolean");
});
