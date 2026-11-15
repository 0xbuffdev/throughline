import {
	closeSync, constants, fstatSync, fsyncSync, lstatSync,
	openSync, readFileSync, readdirSync, realpathSync, renameSync,
	unlinkSync, writeFileSync,
} from "node:fs";
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
 * select the root.
 */
export class TrustedContentRoot {
	readonly root: string;
	constructor(path: string = process.cwd()) {
		let root: string;
		try {
			root = realpathSync(resolve(path));
			if (!lstatSync(root).isDirectory()) fault("THL_PATH", "trusted root must be a directory");
		} catch {
			return fault("THL_PATH", "cannot open trusted content root");
		}
		this.root = root;
	}

	/** Check the full path's parent chain without following any symlink. */
	private guarded(relativePath: string, allowMissingFile = false): string {
		const document = artifactRelativePath(relativePath);
		const segments = document.split("/");
		let current = this.root;
		for (const [index, segment] of segments.entries()) {
			current = join(current, segment);
			if (!within(this.root, current)) fault("THL_PATH", "file escapes trusted content root");
			try {
				const info = lstatSync(current);
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
		const absolute = this.guarded(name);
		let fd: number | undefined;
		try {
			fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
			const stat = fstatSync(fd);
			if (!stat.isFile()) fault("THL_IO", "content is not a regular file: " + name);
			if (stat.size > maxBytes) fault("THL_LIMIT", "content exceeds file limit: " + name);
			const bytes = readFileSync(fd);
			if (bytes.length > maxBytes) fault("THL_LIMIT", "content exceeds file limit: " + name);
			return utf8.decode(bytes);
		} catch (error) {
			if (error instanceof TrustedFileError) throw error;
			fault("THL_IO", "cannot read valid UTF-8 content: " + name);
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
		const target = this.guarded(name, true);
		const parent = dirname(target);
		const temp = join(parent, "." + basename(target) +
			"." + randomBytes(12).toString("hex") + ".tmp");
		let fd: number | undefined;
		try {
			fd = openSync(temp, constants.O_CREAT | constants.O_EXCL |
				constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
			writeFileSync(fd, content, { encoding: "utf8" });
			fsyncSync(fd);
			closeSync(fd);
			fd = undefined;
			this.guarded(name, true);
			renameSync(temp, target);
		} catch (error) {
			if (error instanceof TrustedFileError) throw error;
			fault("THL_IO", "cannot atomically update manifest: " + name);
		} finally {
			if (fd !== undefined) closeSync(fd);
			try { unlinkSync(temp); } catch { /* temp already renamed or absent */ }
		}
	}
}
