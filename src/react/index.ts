export type { SonificationEvent, SonificationOptions } from "../sonify.js";
export { ThroughlinePlayer, type ThroughlinePlayerProps } from "./player.js";
export { ThroughlineEmbed, type ThroughlineEmbedProps } from "./embed.js";

export { ThroughlineScenarios, type ThroughlineScenario, type ThroughlineScenariosProps } from "./scenarios.js";
export type { ThroughlineGuidance, GuidedChapter, CausalLink, GuidanceEvidence } from "./guidance.js";

/** Native schema-2 graph player; TL-U06 adds the sequence alternative. */
export { ThroughlineGraphPlayer, type ThroughlineGraphPlayerProps } from "./graph-player.js";
