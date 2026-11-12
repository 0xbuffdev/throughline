/**
 * The Web Speech synthesis queue is browser-global, not component-local.
 * Coordinate Throughline instances sharing one engine. New narration takes
 * over; the displaced player is paused and its narration is switched off.
 *
 * External scripts can still call speechSynthesis.cancel(). Such calls are
 * reported by the utterance error handler as interruptions.
 */
export interface SpeechOwner {
	onDisplaced(): void;
}

const owners = new WeakMap<SpeechSynthesis, SpeechOwner>();

export function ownsSpeech(engine: SpeechSynthesis, owner: SpeechOwner): boolean {
	return owners.get(engine) === owner;
}

export function acquireSpeech(engine: SpeechSynthesis, owner: SpeechOwner): void {
	const previous = owners.get(engine);
	if (previous === owner) return;
	if (previous) {
		// Drop ownership BEFORE notifying the old player. Its cleanup must
		// never cancel the new player's utterance.
		owners.delete(engine);
		previous.onDisplaced();
		// cancel() clears the browser-wide queue, so only the coordinator
		// may invoke it when replacing an existing Throughline owner.
		try { engine.cancel(); } catch { /* Let speak() report failure. */ }
	}
	owners.set(engine, owner);
}

/** Give up ownership after a natural completion or error, without canceling
 * another application's speech queue. */
export function releaseSpeech(engine: SpeechSynthesis, owner: SpeechOwner): void {
	if (ownsSpeech(engine, owner)) owners.delete(engine);
}

/** Stop the current Throughline owner. Never cancel another instance's voice. */
export function cancelOwnedSpeech(engine: SpeechSynthesis, owner: SpeechOwner): void {
	if (!ownsSpeech(engine, owner)) return;
	owners.delete(engine);
	try { engine.cancel(); } catch { /* Stopping optional audio is best-effort. */ }
}
