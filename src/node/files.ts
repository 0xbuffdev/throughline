import {
	closeSync, constants, fstatSync, fsyncSync, lstatSync,
	openSync, readSync, readdirSync, realpathSync, renameSync,
	unlinkSync, writeFileSync,
} from "node:fs";
import type { BigIntStats } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { artifactRelativePath } from "../v2/authoring.js";

export class TrustedFileError extends Error {
	constructor(
		readonly code: "THL_IO" | "THL_PATH" | "THL_LIMIT",
		message: string,
	) {
		super(code + ": " + message);
		this.name = "TrustedFileError";
	}
}
function fault(code: TrustedFileError["code"], message: string): never {
	throw new TrustedFileError(code, message);
}
function within(root: string, absolute: string): boolean {
	const path = relative(root, absolute);
	return path === "" || (path !== ".." && !path.startsWith(".." + sep) && !isAbsolute(path));
}
const utf8 = new TextDecoder("utf-8", { fatal: true });
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const READ_CHUNK = 64 * 1024;
type PathIdentity = Readonly<{ dev: bigint; ino: bigint }>;
function sameIdentity(a: PathIdentity, b: PathIdentity): boolean {
	return a.dev === b.dev && a.ino === b.ino;
}
const EXCLUDED_DIRECTORIES = new Set([
	".git", "node_modules", ".next", ".astro", "dist", "build", "coverage", ".turbo",
]);

/**
 * A trusted filesystem root for first-party Node CLI and host plugins.
 * Every relative name passes the pure POSIX locator validator; all traversed
 * paths must stay inside the real root and must not be symbolic links.
 *
 * The library code never imports this module. In particular, host paths
 * cannot come from Markdown/MDX content. Only trusted CLI/host config may
 * select the root. The root and ancestors must be controlled by the host;
 * concurrent untrusted directory writers are outside this portable Node
 * boundary. Identity rechecks detect observable replacements, not every race.
 */
export class TrustedContentRoot {
	readonly root!: string;
	private readonly rootIdentity!: PathIdentity;
	constructor(path: string = process.cwd()) {
		let root: string;
		try {
			root = realpathSync(resolve(path));
			const info = lstatSync(root, { bigint: true });
			if (!info.isDirectory()) fault("THL_PATH", "trusted root must be a directory");
			this.rootIdentity = { dev: info.dev, ino: info.ino };
		} catch {
			return fault("THL_PATH", "cannot open trusted content root");
		}
		this.root = root;
	}

	/** Check the full path's parent chain without following any symlink. */
	private guarded(relativePath: string, allowMissingFile = false,
		chain?: Map<string, PathIdentity>): string {
		this.assertRoot();
		const document = artifactRelativePath(relativePath);
		const segments = document.split("/");
		let current = this.root;
		for (const [index, segment] of segments.entries()) {
			current = join(current, segment);
			if (!within(this.root, current)) fault("THL_PATH", "file escapes trusted content root");
			try {
				const info = lstatSync(current, { bigint: true });
				chain?.set(current, { dev: info.dev, ino: info.ino });
				if (info.isSymbolicLink()) fault("THL_PATH", "symbolic link forbidden in trusted content path: " + document);
				if (index < segments.length - 1 && !info.isDirectory())
					fault("THL_PATH", "content path parent must be a directory: " + document);
			} catch (error) {
				if (error instanceof TrustedFileError) throw error;
				if (allowMissingFile && index === segments.length - 1 &&
					(error as NodeJS.ErrnoException).code === "ENOENT") return current;
				fault("THL_IO", "content path is not accessible: " + document);
			}
		}
		try {
			if (!within(this.root, realpathSync(current)))
				fault("THL_PATH", "resolved content path escapes trusted root");
		} catch (error) {
			if (error instanceof TrustedFileError) throw error;
			if (!allowMissingFile) fault("THL_IO", "cannot resolve content path: " + document);
		}
		return current;
	}

	private assertRoot(): void {
		try {
			const info = lstatSync(this.root, { bigint: true });
			if (!info.isDirectory() || !sameIdentity(info, this.rootIdentity))
				fault("THL_PATH", "trusted content root changed");
		} catch {
			fault("THL_PATH", "trusted content root changed or is inaccessible");
		}
	}

	private recheck(name: string, original: ReadonlyMap<string, PathIdentity>,
		allowMissingFile = false): void {
		const current = new Map<string, PathIdentity>();
		this.guarded(name, allowMissingFile, current);
		if (current.size !== original.size || [...original].some(([path, identity]) => {
			const next = current.get(path);
			return !next || !sameIdentity(identity, next);
		})) fault("THL_PATH", "content path changed during operation: " + name);
	}

	relativeForFile(filePath: string): string {
		if (typeof filePath !== "string" || !filePath)
			fault("THL_PATH", "host VFile path is missing");
		const absolute = resolve(filePath);
		if (!within(this.root, absolute) || absolute === this.root)
			fault("THL_PATH", "host VFile path is outside trusted root");
		const candidate = relative(this.root, absolute).split(sep).join("/");
		this.guarded(candidate);
		return artifactRelativePath(candidate);
	}

	read(relativePath: string, maxBytes = DEFAULT_MAX_BYTES): string {
		const name = artifactRelativePath(relativePath);
		if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > DEFAULT_MAX_BYTES)
			fault("THL_LIMIT", "file limit must be between zero and 4 MiB");
		const chain = new Map<string, PathIdentity>();
		const absolute = this.guarded(name, false, chain);
		let fd: number | undefined;
		try {
			const before = lstatSync(absolute, { bigint: true });
			if (!before.isFile()) fault("THL_IO", "content is not a regular file: " + name);
			// O_NONBLOCK prevents a FIFO replacement from blocking open on POSIX.
			fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) |
				(constants.O_NONBLOCK ?? 0));
			const stat = fstatSync(fd, { bigint: true });
			if (!stat.isFile()) fault("THL_IO", "content is not a regular file: " + name);
			if (!sameIdentity(stat, before) || !sameIdentity(stat, chain.get(absolute)!))
				fault("THL_PATH", "content file changed during open: " + name);
			this.recheck(name, chain);
			if (stat.size > BigInt(maxBytes)) fault("THL_LIMIT", "content exceeds file limit: " + name);
			// One fixed buffer also bounds allocation under arbitrarily short reads.
			const bytes = Buffer.allocUnsafe(maxBytes + 1);
			let total = 0;
			while (true) {
				// Read at most the remaining budget plus one overflow sentinel,
				// regardless of file growth after fstat.
				const count = readSync(fd, bytes, total,
					Math.min(READ_CHUNK, maxBytes - total + 1), null);
				if (count === 0) break;
				total += count;
				if (total > maxBytes) fault("THL_LIMIT", "content exceeds file limit: " + name);
			}
			this.recheck(name, chain);
			return utf8.decode(bytes.subarray(0, total));
		} catch (error) {
			if (error instanceof TrustedFileError) throw error;
			return fault("THL_IO", "cannot read valid UTF-8 content: " + name);
		} finally {
			if (fd !== undefined) closeSync(fd);
		}
	}

	exists(relativePath: string): boolean {
		const name = artifactRelativePath(relativePath);
		try {
			this.guarded(name);
			return true;
		} catch (error) {
			if (error instanceof TrustedFileError && error.code === "THL_IO") {
				// Check ENOENT only; all other IO failures remain errors.
				const absolute = resolve(this.root, ...name.split("/"));
				try { lstatSync(absolute); } catch (cause) {
					if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
				}
			}
			throw error;
		}
	}

	isDirectory(relativePath: string): boolean {
		return lstatSync(this.guarded(relativePath)).isDirectory();
	}

	walkMarkdown(relativePath: string): readonly string[] {
		const start = relativePath === "." ? "" : artifactRelativePath(relativePath);
		this.assertRoot();
		const absolute = start ? this.guarded(start) : this.root;
		const results: string[] = [];
		let visited = 0;
		const visit = (directory: string, relativeName: string): void => {
			for (const entry of readdirSync(directory, { withFileTypes: true })
				.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
				if (++visited > 50_000) fault("THL_LIMIT", "directory traversal work limit exceeded");
				if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
				const child = relativeName ? relativeName + "/" + entry.name : entry.name;
				const name = artifactRelativePath(child);
				if (entry.isSymbolicLink()) fault("THL_PATH", "symbolic link forbidden in content tree: " + name);
				const childPath = this.guarded(name);
				if (entry.isDirectory()) visit(childPath, name);
				else if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
					results.push(name);
					if (results.length > 10_000) fault("THL_LIMIT", "too many Markdown documents");
				}
			}
		};
		if (lstatSync(absolute).isDirectory()) visit(absolute, start);
		else if (/\.(md|mdx)$/i.test(start)) results.push(start);
		else fault("THL_PATH", "check target must be a Markdown/MDX file or directory");
		return results.sort();
	}

	/** Atomic manifest creation/update; never use a caller-controlled temp path. */
	writeManifest(relativePath: string, content: string): void {
		const name = artifactRelativePath(relativePath);
		if (Buffer.byteLength(content, "utf8") > DEFAULT_MAX_BYTES)
			fault("THL_LIMIT", "manifest exceeds 4 MiB");
		const chain = new Map<string, PathIdentity>();
		const target = this.guarded(name, true, chain);
		const parent = dirname(target);
		const temp = join(parent, "." + basename(target) +
			"." + randomBytes(12).toString("hex") + ".tmp");
		let fd: number | undefined;
		let tempIdentity: BigIntStats | undefined;
		try {
			this.recheck(name, chain, true);
			fd = openSync(temp, constants.O_CREAT | constants.O_EXCL |
				constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
			tempIdentity = fstatSync(fd, { bigint: true });
			this.recheck(name, chain, true);
			if (!tempIdentity.isFile() || !sameIdentity(tempIdentity, lstatSync(temp, { bigint: true })))
				fault("THL_PATH", "manifest temporary file changed");
			writeFileSync(fd, content, { encoding: "utf8" });
			fsyncSync(fd);
			closeSync(fd);
			fd = undefined;
			this.recheck(name, chain, true);
			if (!sameIdentity(tempIdentity, lstatSync(temp, { bigint: true })))
				fault("THL_PATH", "manifest temporary file changed");
			renameSync(temp, target);
		} catch (error) {
			if (error instanceof TrustedFileError) throw error;
			fault("THL_IO", "cannot atomically update manifest: " + name);
		} finally {
			if (fd !== undefined) closeSync(fd);
			try {
				// Never unlink through an observably replaced parent or delete
				// a different file that acquired the temporary name.
				this.recheck(name, chain, true);
				if (tempIdentity && sameIdentity(tempIdentity, lstatSync(temp, { bigint: true }))) unlinkSync(temp);
			} catch { /* renamed, absent or changed path: leave cleanup to host */ }
		}
	}
}
