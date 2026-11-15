import { useMemo } from "react";
import { compileArtifact } from "../v2/compiler.js";
import { parseArtifactJson } from "../v2/validator.js";
import { ThroughlineGraphPlayer, type ThroughlineGraphPlayerProps } from "./graph-player.js";

/**
 * MDX host bridge for reviewed, literal schema-2 artifact JSON.
 * Remark does not inject JSX expressions, execute text or fetch materializations.
 */
export interface ThroughlineEmbedProps extends Omit<ThroughlineGraphPlayerProps, "trace"> {
	artifactJson: string;
}

export function ThroughlineEmbed({ artifactJson, ...props }: ThroughlineEmbedProps) {
	const trace = useMemo(() => compileArtifact(parseArtifactJson(artifactJson)), [artifactJson]);
	return <ThroughlineGraphPlayer trace={trace} {...props} />;
}
