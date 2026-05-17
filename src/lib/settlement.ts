import type { Consumption, Entry } from "@/types";

/** Minutes still available on an overtime entry. Treats missing consumedMin as 0. */
export function availableMin(overtime: Entry): number {
	if (overtime.kind !== "overtime") return 0;
	return overtime.durationMin - (overtime.consumedMin ?? 0);
}

/** True when an overtime entry has been fully paid out via time-off consumption. */
export function isSettled(overtime: Entry): boolean {
	return overtime.kind === "overtime" && availableMin(overtime) === 0;
}

/** Total minutes still in the bank across a set of overtime entries. */
export function openOvertimeMin(overtimes: Entry[]): number {
	let total = 0;
	for (const e of overtimes) {
		if (e.kind === "overtime") total += availableMin(e);
	}
	return total;
}

/** Total minutes that have been settled (consumed by time-off) across a set of overtime entries. */
export function settledOvertimeMin(overtimes: Entry[]): number {
	let total = 0;
	for (const e of overtimes) {
		if (e.kind === "overtime") total += e.consumedMin ?? 0;
	}
	return total;
}

export interface ConsumptionPlan {
	consumptions: Consumption[];
	/** Overtime entries with their consumedMin updated. Subset of the input — only the ones touched. */
	updatedOvertime: Entry[];
	/** Total minutes the plan consumed (always === requested when plan succeeds). */
	consumedTotalMin: number;
}

export class InsufficientHoursError extends Error {
	readonly requestedMin: number;
	readonly availableMin: number;

	constructor(requestedMin: number, availableMin: number) {
		super(`Requested ${requestedMin} min but only ${availableMin} min available in the bank.`);
		this.name = "InsufficientHoursError";
		this.requestedMin = requestedMin;
		this.availableMin = availableMin;
	}
}

/**
 * FIFO plan for consuming `requestedMin` minutes from a member's open overtime entries.
 * Oldest entries are consumed first (by `date`, then `createdAt` as tiebreaker).
 * Returns the consumption list, the OT entries with updated `consumedMin`, and the total consumed.
 *
 * Pure function — does not touch IDB. Caller persists results via `commitTimeoffWithConsumption`.
 *
 * @throws {InsufficientHoursError} if the member does not have enough open overtime.
 */
export function planConsumption(
	memberOvertimeEntries: Entry[],
	requestedMin: number
): ConsumptionPlan {
	if (requestedMin <= 0) {
		return { consumptions: [], updatedOvertime: [], consumedTotalMin: 0 };
	}

	const open = memberOvertimeEntries
		.filter((e) => e.kind === "overtime" && availableMin(e) > 0)
		.sort((a, b) => {
			if (a.date !== b.date) return a.date < b.date ? -1 : 1;
			return a.createdAt - b.createdAt;
		});

	const totalAvailable = open.reduce((sum, e) => sum + availableMin(e), 0);
	if (totalAvailable < requestedMin) {
		throw new InsufficientHoursError(requestedMin, totalAvailable);
	}

	let remaining = requestedMin;
	const consumptions: Consumption[] = [];
	const updatedOvertime: Entry[] = [];

	for (const ot of open) {
		if (remaining === 0) break;
		const available = availableMin(ot);
		const take = Math.min(remaining, available);
		consumptions.push({ overtimeEntryId: ot.id, consumedMin: take });
		updatedOvertime.push({
			...ot,
			consumedMin: (ot.consumedMin ?? 0) + take
		});
		remaining -= take;
	}

	return {
		consumptions,
		updatedOvertime,
		consumedTotalMin: requestedMin
	};
}

/**
 * Reverse a time-off's consumption — returns the overtime entries with their `consumedMin` decremented.
 * Used when a time-off entry is deleted, to restore the bank.
 *
 * Pure function. Missing referenced OTs are silently skipped (defensive: if an OT was somehow deleted
 * out-of-band, we still want the time-off delete to succeed).
 */
export function planRestoration(
	memberOvertimeEntries: Entry[],
	consumptions: Consumption[]
): Entry[] {
	if (consumptions.length === 0) return [];
	const byId = new Map(memberOvertimeEntries.map((e) => [e.id, e]));
	const updated: Entry[] = [];
	for (const c of consumptions) {
		const ot = byId.get(c.overtimeEntryId);
		if (!ot || ot.kind !== "overtime") continue;
		const current = ot.consumedMin ?? 0;
		const next = Math.max(0, current - c.consumedMin);
		updated.push({ ...ot, consumedMin: next });
	}
	return updated;
}
