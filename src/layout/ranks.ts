import type { Entity, Relation } from "../model.js";

export function assignRanks(
	entities: Entity[],
	relations: Relation[],
): Map<string, number> {
	const out = new Map<string, string[]>(
		entities.map((entity) => [entity.id, []]),
	);
	const indegree = new Map<string, number>(
		entities.map((entity) => [entity.id, 0]),
	);
	const connected = new Set<string>();
	for (const relation of relations) {
		out.get(relation.from)?.push(relation.to);
		indegree.set(relation.to, indegree.get(relation.to)! + 1);
		connected.add(relation.from);
		connected.add(relation.to);
	}
	const colour = new Map<string, 1 | 2>();
	const back = new Set<string>();
	const visit = (id: string) => {
		colour.set(id, 1);
		for (const to of out.get(id)!) {
			const state = colour.get(to);
			if (state === 1) back.add(`${id}>${to}`);
			else if (!state) visit(to);
		}
		colour.set(id, 2);
	};
	const order = [
		...entities.filter((entity) => indegree.get(entity.id) === 0),
		...entities,
	];
	for (const entity of order) if (!colour.has(entity.id)) visit(entity.id);

	const preds = new Map<string, string[]>(
		entities.map((entity) => [entity.id, []]),
	);
	for (const relation of relations)
		if (
			relation.from !== relation.to &&
			!back.has(`${relation.from}>${relation.to}`)
		)
			preds.get(relation.to)?.push(relation.from);
	const ranks = new Map<string, number>();
	const rank = (id: string): number => {
		const known = ranks.get(id);
		if (known !== undefined) return known;
		ranks.set(id, 0);
		const value = Math.max(-1, ...(preds.get(id) ?? []).map(rank)) + 1;
		ranks.set(id, value);
		return value;
	};
	for (const entity of entities) if (connected.has(entity.id)) rank(entity.id);
	const perLane = new Map<string, number>();
	for (const entity of entities) {
		if (connected.has(entity.id)) continue;
		const lane = entity.lane ?? "State";
		const next = perLane.get(lane) ?? 0;
		perLane.set(lane, next + 1);
		ranks.set(entity.id, next);
	}
	return ranks;
}
