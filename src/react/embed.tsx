import { useMemo } from "react";
import { compile } from "../domains/registry.js";
import { ThroughlinePlayer, type ThroughlinePlayerProps } from "./player.js";

/** The MDX host supplies the literal, complete `thl <domain>` source. */
export interface ThroughlineEmbedProps extends Omit<ThroughlinePlayerProps, "trace"> {
	source: string;
}

/**
 * React-only source bridge. Stable source and unrelated prop changes reuse
 * the compiled trace, preserving timeline state in ThroughlinePlayer.
 */
export function ThroughlineEmbed({ source, ...playerProps }: ThroughlineEmbedProps) {
	const trace = useMemo(() => compile(source), [source]);
	return <ThroughlinePlayer trace={trace} {...playerProps} />;
}
