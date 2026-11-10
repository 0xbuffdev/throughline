export type Value =
	| null
	| boolean
	| number
	| string
	| Value[]
	| { [key: string]: Value };
export const VIEWS = [
	"auto",
	"text",
	"number",
	"array",
	"stack",
	"matrix",
	"bits",
	"record",
] as const;
export type View = (typeof VIEWS)[number];
export type Entity = {
	id: string;
	label: string;
	value: Value;
	lane?: string;
	view?: View;
	/** Absent from the scene until explicitly shown; identity stays stable. */
	hidden?: boolean;
};
export type Relation = {
	id: string;
	from: string;
	to: string;
	label?: string;
	hidden?: boolean;
};
export type SourceLocation = { line: number };
/** Targets address an entity or a position inside its value: `arr`, `arr[3]`, `grid[1][2]`, `cfg.mode`. */
export type Event = (
	| { op: "set"; target: string; value: Value }
	| { op: "focus"; targets: string[] }
	| { op: "send"; relation: string; value?: Value }
	| { op: "note"; text: string }
	| { op: "show" | "hide"; kind: "node" | "link"; id: string }
) & { source?: SourceLocation };
export type Beat = { label: string; events: Event[]; source?: SourceLocation };
export const GROUP_LAYOUTS = ["row", "column", "tree"] as const;
export type GroupLayout = (typeof GROUP_LAYOUTS)[number];
/** Optional hierarchy metadata; flat name-based lanes remain valid. */
export type SceneGroup = {
	name: string;
	layout: GroupLayout;
	/** Stable identity for nested groups. Required when used as a parent or child. */
	id?: string;
	/** References an explicitly identified SceneGroup, never an entity. */
	parentId?: string;
};
export type Program = {
	version: 1;
	entities: Entity[];
	relations: Relation[];
	beats: Beat[];
	groups?: SceneGroup[];
};
export type Snapshot = {
	entities: Entity[];
	relations: Relation[];
	active: string[];
	changed: string[];
	transfers: { relation: string; value?: Value }[];
	notes: string[];
};
export type Frame = {
	index: number;
	label: string;
	state: Snapshot;
	events: Event[];
	source?: SourceLocation;
};
export type Trace = { version: 1; frames: Frame[]; groups?: SceneGroup[] };
export type Diagnostic = { message: string; line?: number; beat?: number };
export class ProgramError extends Error {
	constructor(public diagnostics: Diagnostic[]) {
		super(
			diagnostics
				.map(
					({ message, line, beat }) =>
						`${line ? `Line ${line}: ` : beat !== undefined ? `Step ${beat + 1}: ` : ""}${message}`,
				)
				.join("\n"),
		);
		this.name = "ProgramError";
	}
}
