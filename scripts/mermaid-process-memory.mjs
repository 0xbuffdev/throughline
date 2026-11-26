import { execFileSync } from "node:child_process";
import { platform } from "node:os";

/** Sum RSS of this dedicated measurement process and its descendants.
 * Shared pages can be counted more than once. Sampled maximum is a lower
 * bound on peak sampled RSS, not unique memory or instantaneous peak.
 */
export function processTreeRss(snapshot, root) {
 const rows = snapshot.trim().split(/\n/).map(line => line.trim().split(/\s+/))
  .filter(parts => parts.length >= 4).map(([pid, ppid, rss, comm]) => ({ pid: Number(pid), ppid: Number(ppid), rss: Number(rss), comm }));
 const visited = new Set([root]);
 let changed = true;
 while (changed) {
  changed = false;
  for (const row of rows) if (visited.has(row.ppid) && !visited.has(row.pid)) { visited.add(row.pid); changed = true; }
 }
 const selected = rows.filter(row => visited.has(row.pid) && row.comm !== "ps" && Number.isFinite(row.rss));
 if (!selected.some(row => row.pid === root)) throw new Error("Measurement root not present");
 return { rssBytes: selected.reduce((sum, row) => sum + row.rss * 1024, 0), processes: selected.length };
}

export function sampleProcessMemory() {
 const intervalMs = 100;
 const method = "Linux ps RSS sum of dedicated Node measurement process and descendants; shared pages may be counted twice; sampled max, not exact peak or unique memory";
 let samples = 0, baseline, max, failure, finished, timer;
 function sample() {
  try {
   const value = processTreeRss(execFileSync("ps", ["-eo", "pid=,ppid=,rss=,comm="], { encoding: "utf8" }), process.pid);
   baseline ??= value;
   if (!max || value.rssBytes > max.rssBytes) max = value;
   samples++;
  } catch (error) { failure = String(error); }
 }
 if (platform() === "linux") { sample(); timer = setInterval(sample, intervalMs); timer.unref(); }
 return { stop() {
  if (finished) return finished;
  clearInterval(timer);
  if (platform() === "linux") sample();
  finished = { method, intervalMs, samples, baseline: baseline ?? null, max: max ?? null,
   available: samples >= 2 && !failure, ...(failure ? { failure } : {}),
   ...(platform() !== "linux" ? { reason: "NOT PERFORMED — Linux ps sampler only" } : {}) };
  return finished;
 } };
}
