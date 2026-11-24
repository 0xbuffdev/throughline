import type { Mode, PathLike } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
	beforeOpen: undefined as undefined | ((path: PathLike, flags: string | number) => void),
	afterOpen: undefined as undefined | ((path: PathLike, flags: string | number) => void),
	beforeRead: undefined as undefined | ((length: number) => void),
	maxRead: undefined as number | undefined,
}));
vi.mock("node:fs", async importOriginal => {
	const fs = await importOriginal<typeof import("node:fs")>();
	return {
		...fs,
		openSync(path: PathLike, flags: string | number, mode?: Mode) {
			hooks.beforeOpen?.(path, flags);
			const fd = fs.openSync(path, flags, mode);
			try { hooks.afterOpen?.(path, flags); }
			catch (error) { fs.closeSync(fd); throw error; }
			return fd;
		},
		readSync(fd: number, buffer: Buffer, offset: number, length: number, position: number | null) {
			hooks.beforeRead?.(length);
			return fs.readSync(fd, buffer, offset, Math.min(length, hooks.maxRead ?? length), position);
		},
	};
});
import { TrustedContentRoot } from "../node/files.js";

const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
const folders: string[] = [];
function directory(): string {
	const path = fs.mkdtempSync(join(tmpdir(), "throughline-file-boundary-"));
	folders.push(path);
	return path;
}
afterEach(() => {
	hooks.beforeOpen = hooks.afterOpen = hooks.beforeRead = undefined;
	hooks.maxRead = undefined;
	for (const path of folders.splice(0)) fs.rmSync(path, { recursive: true, force: true });
});

it.skipIf(process.platform === "win32")("rejects a real FIFO before attempting open", () => {
	const root = directory();
	const fifo = join(root, "pipe");
	const made = spawnSync("mkfifo", [fifo], { timeout: 2_000 });
	expect(made.status).toBe(0);
	let opened = false;
	// Guard against hanging the test if the production precheck regresses.
	hooks.beforeOpen = () => { opened = true; throw new Error("must not open FIFO"); };
	expect(() => new TrustedContentRoot(root).read("pipe")).toThrow(/THL_IO.*regular file/);
	expect(opened).toBe(false);
});

it("caps descriptor reads even when the file grows after fstat", () => {
	const root = directory();
	const target = join(root, "data");
	fs.writeFileSync(target, "a");
	let requested = 0, appended = false;
	hooks.beforeRead = length => {
		requested += length;
		if (!appended) { appended = true; fs.appendFileSync(target, "b".repeat(64)); }
	};
	expect(() => new TrustedContentRoot(root).read("data", 8)).toThrow(/THL_LIMIT/);
	expect(appended).toBe(true);
	expect(requested).toBe(9);
});

it("handles short reads without losing multibyte UTF-8 or exceeding the cap", () => {
	const root = directory();
	fs.writeFileSync(join(root, "data"), "é🙂");
	hooks.maxRead = 1;
	expect(new TrustedContentRoot(root).read("data", 6)).toBe("é🙂");
});

it.skipIf(process.platform === "win32")("rejects an ancestor replaced during open before reading bytes", () => {
	const root = directory(), outside = directory();
	const parent = join(root, "nested");
	fs.mkdirSync(parent);
	fs.writeFileSync(join(parent, "data"), "inside");
	fs.writeFileSync(join(outside, "data"), "outside-secret");
	hooks.beforeOpen = () => {
		fs.renameSync(parent, join(root, "moved"));
		fs.symlinkSync(outside, parent, "dir");
	};
	let reads = 0;
	hooks.beforeRead = () => { reads++; };
	expect(() => new TrustedContentRoot(root).read("nested/data")).toThrow(/THL_PATH/);
	expect(reads).toBe(0);
});

it.skipIf(process.platform === "win32")("detects ancestor replacement after temporary open before writing manifest data", () => {
	const root = directory(), outside = directory();
	const parent = join(root, "nested");
	fs.mkdirSync(parent);
	fs.writeFileSync(join(parent, "manifest.json"), "original");
	fs.writeFileSync(join(outside, "manifest.json"), "outside-original");
	hooks.afterOpen = () => {
		fs.renameSync(parent, join(root, "moved"));
		fs.symlinkSync(outside, parent, "dir");
	};
	expect(() => new TrustedContentRoot(root).writeManifest("nested/manifest.json", "new data")).toThrow(/THL_PATH/);
	expect(fs.readFileSync(join(outside, "manifest.json"), "utf8")).toBe("outside-original");
	expect(fs.readdirSync(outside)).toEqual(["manifest.json"]);
	expect(fs.readFileSync(join(root, "moved", "manifest.json"), "utf8")).toBe("original");
});


it.skipIf(process.platform === "win32")("documents the empty temporary file side effect of a parent swap before exclusive open", () => {
	const root = directory(), outside = directory();
	const parent = join(root, "nested");
	fs.mkdirSync(parent);
	fs.writeFileSync(join(parent, "manifest.json"), "original");
	fs.writeFileSync(join(outside, "manifest.json"), "outside-original");
	hooks.beforeOpen = () => {
		fs.renameSync(parent, join(root, "moved"));
		fs.symlinkSync(outside, parent, "dir");
	};
	expect(() => new TrustedContentRoot(root).writeManifest("nested/manifest.json", "new data")).toThrow(/THL_PATH/);
	expect(fs.readFileSync(join(outside, "manifest.json"), "utf8")).toBe("outside-original");
	expect(fs.readFileSync(join(root, "moved", "manifest.json"), "utf8")).toBe("original");
	// Outside the supported stable-root threat model: pathname creation
	// has already occurred before identity checks observe the substitution.
	// Cleanup intentionally does not unlink through the replaced parent.
	const temporary = fs.readdirSync(outside).filter(name => name !== "manifest.json");
	expect(temporary).toHaveLength(1);
	expect(temporary[0]).toMatch(/^\.manifest\.json\.[0-9a-f]{24}\.tmp$/);
	expect(fs.statSync(join(outside, temporary[0])).size).toBe(0);
	expect(fs.readFileSync(join(outside, temporary[0]), "utf8")).toBe("");
});
