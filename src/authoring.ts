import { validateProgram } from "./compiler.js";
import { sourceLines } from "./domains/lines.js";
import type { ThlBlock } from "./dsl.js";
import {
	type Beat,
	GROUP_LAYOUTS,
	type GroupLayout,
	type Program,
	ProgramError,
	type Value,
	VIEWS,
	type View,
} from "./model.js";
import { parseTarget } from "./path.js";

export function parseProgram(ast: ThlBlock): Program {
	const program: Program = {
		version: 1,
		entities: [],
		relations: [],
		beats: [],
	};
	let beat: Beat | undefined;
	sourceLines(ast).forEach(({ text, line }) => {
		const source = { line };
		const fail = (message: string): never => {
			throw new ProgramError([{ message, line }]);
		};
		const json = (value: string): Value => {
			try {
				return JSON.parse(value) as Value;
			} catch {
				return fail(
					"Expected a JSON value (quote strings; arrays and objects are supported).",
				);
			}
		};
		const quoted = (value: string): string => {
			const parsed = json(value);
			return typeof parsed === "string"
				? parsed
				: fail("Expected a quoted label.");
		};
		const group = text.match(/^group\s+("(?:[^"\\]|\\.)*")\s+as\s+([a-z]+)$/);
		if (group) {
			if (beat) fail("Declare groups before the first step.");
			if (!(GROUP_LAYOUTS as readonly string[]).includes(group[2]))
				fail(
					`Unknown group layout “${group[2]}”. Use ${GROUP_LAYOUTS.join(", ")}.`,
				);
			const name = quoted(group[1]);
			program.groups ??= [];
			if (program.groups.some((candidate) => candidate.name === name))
				fail(`Duplicate group “${name}”.`);
			program.groups.push({ name, layout: group[2] as GroupLayout });
			return;
		}
		const node = text.match(
			/^node\s+([\w-]+)\s+("(?:[^"\\]|\\.)*")(?:\s+in\s+("(?:[^"\\]|\\.)*"))?(?:\s+as\s+([a-z]+))?(\s+hidden)?(?:\s*=\s*(.+))?$/,
		);
		if (node) {
			if (beat) fail("Declare nodes and links before the first step.");
			if (node[4] && !(VIEWS as readonly string[]).includes(node[4]))
				fail(`Unknown view “${node[4]}”. Use ${VIEWS.join(", ")}.`);
			program.entities.push({
				id: node[1],
				label: quoted(node[2]),
				lane: node[3] ? quoted(node[3]) : undefined,
				...(node[4] ? { view: node[4] as View } : {}),
				...(node[5] ? { hidden: true } : {}),
				value: node[6] ? json(node[6]) : null,
			});
			return;
		}
		const link = text.match(
			/^link\s+([\w-]+)\s+([\w-]+)\s*->\s*([\w-]+)(?:\s+("(?:[^"\\]|\\.)*"))?(\s+hidden)?$/,
		);
		if (link) {
			if (beat) fail("Declare nodes and links before the first step.");
			program.relations.push({
				id: link[1],
				from: link[2],
				to: link[3],
				label: link[4] ? quoted(link[4]) : undefined,
				...(link[5] ? { hidden: true } : {}),
			});
			return;
		}
		const step = text.match(/^step\s+("(?:[^"\\]|\\.)*")$/);
		if (step) {
			beat = { label: quoted(step[1]), events: [], source };
			program.beats.push(beat);
			return;
		}
		if (!beat) fail("Expected node, link, or step. Events must follow a step.");
		const set = text.match(/^set\s+([^\s=]+)\s*=\s*(.+)$/);
		const send = text.match(/^send\s+([\w-]+)(?:\s*=\s*(.+))?$/);
		const focus = text.match(/^focus(?:\s+(.+))?$/);
		const note = text.match(/^note\s+("(?:[^"\\]|\\.)*")$/);
		const visibility = text.match(/^(show|hide)\s+(node|link)\s+([\w-]+)$/);
		if (visibility) {
			beat?.events.push({
				op: visibility[1] as "show" | "hide",
				kind: visibility[2] as "node" | "link",
				id: visibility[3],
				source,
			});
		} else if (set) {
			if (!parseTarget(set[1]))
				fail(
					`Invalid target “${set[1]}”. Use an id, optionally followed by [index] or .key.`,
				);
			beat?.events.push({
				op: "set",
				target: set[1],
				value: json(set[2]),
				source,
			});
		} else if (send)
			beat?.events.push({
				op: "send",
				relation: send[1],
				...(send[2] ? { value: json(send[2]) } : {}),
				source,
			});
		else if (focus) {
			const targets = (focus[1] ?? "").split(/[\s,]+/).filter(Boolean);
			const bad = targets.find((target) => !parseTarget(target));
			if (bad)
				fail(
					`Invalid target “${bad}”. Use an id, optionally followed by [index] or .key.`,
				);
			beat?.events.push({ op: "focus", targets, source });
		} else if (note)
			beat?.events.push({ op: "note", text: quoted(note[1]), source });
		else
			fail(
				"Unknown statement. Use node, link, step, set, focus, send, note, show, or hide.",
			);
	});
	validateProgram(program);
	return program;
}
