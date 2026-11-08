/** Optional stage feedback. Visual focus is not evidence of cost or contention. */
export const SONIFY_MIN_HZ = 261.63;
export const SONIFY_MAX_HZ = 523.25;
export const SONIFY_STANDARD_MS = 180;
export type SonificationEvent = {
	step: number;
	total: number;
	frequency: number;
	durationMs: number;
};
export type SonificationHandler = (event: SonificationEvent) => void;
export type SonificationOptions = {
	enabled?: boolean;
	onTone?: SonificationHandler;
};

export function frequencyForStep(step: number, total: number): number {
	if (
		!Number.isFinite(step) ||
		!Number.isFinite(total) ||
		total <= 1 ||
		step <= 0
	)
		return SONIFY_MIN_HZ;
	if (step >= total - 1) return SONIFY_MAX_HZ;
	return (
		Math.round(
			SONIFY_MIN_HZ *
				(SONIFY_MAX_HZ / SONIFY_MIN_HZ) ** (step / (total - 1)) *
				100,
		) / 100
	);
}

export function sonificationEvent(
	step: number,
	total: number,
): SonificationEvent {
	return {
		step,
		total,
		frequency: frequencyForStep(step, total),
		durationMs: SONIFY_STANDARD_MS,
	};
}
