/**
 * Simulates the DataProvider.addTimeoffBatch flow against real (faked) IDB transactions to
 * make sure planning + atomic commit gives consistent state.
 */
import { describe, expect, it } from "vitest";

import { commitTimeoffBatchWithConsumption, listEntries, saveEntry } from "@/lib/db";
import { newId } from "@/lib/id";
import {
	InsufficientHoursError,
	isSettled,
	openOvertimeMin,
	planConsumption
} from "@/lib/settlement";
import type { Entry } from "@/types";

function ot(id: string, durationMin: number, date: string, createdAt: number): Entry {
	return {
		id,
		memberId: "m1",
		kind: "overtime",
		date,
		durationMin,
		consumedMin: 0,
		createdAt
	};
}

/**
 * Mini-replica of the DataProvider batch flow. Real component code goes through React state,
 * but the underlying contract is purely the helpers below — testing them gives us confidence
 * the algorithm holds.
 */
function simulateBatchPlan(memberOvertimes: Entry[], dates: string[], durationMinPerDay: number) {
	const memberOT = memberOvertimes.map((e) => ({ ...e }));
	const totalAvailable = memberOT.reduce(
		(sum, e) => sum + (e.durationMin - (e.consumedMin ?? 0)),
		0
	);
	const totalRequested = durationMinPerDay * dates.length;
	if (totalAvailable < totalRequested) {
		throw new InsufficientHoursError(totalRequested, totalAvailable);
	}

	const newTimeoffs: Entry[] = [];
	const otByIdLatest = new Map<string, Entry>();
	for (let i = 0; i < dates.length; i++) {
		const plan = planConsumption(memberOT, durationMinPerDay);
		const updatedById = new Map(plan.updatedOvertime.map((o) => [o.id, o]));
		for (let j = 0; j < memberOT.length; j++) {
			const updated = updatedById.get(memberOT[j].id);
			if (updated) memberOT[j] = updated;
		}
		for (const [id, updated] of updatedById) {
			otByIdLatest.set(id, updated);
		}
		newTimeoffs.push({
			id: newId(),
			memberId: "m1",
			kind: "timeoff",
			date: dates[i],
			durationMin: durationMinPerDay,
			consumedMin: undefined,
			consumptions: plan.consumptions,
			createdAt: 1000 + i
		});
	}
	return { newTimeoffs, updatedOvertime: Array.from(otByIdLatest.values()) };
}

describe("plan time off batch", () => {
	it("walks the bank across 5 days × 8h consuming oldest first", async () => {
		await saveEntry(ot("ot1", 480, "2026-04-01", 100));
		await saveEntry(ot("ot2", 480, "2026-04-05", 200));
		await saveEntry(ot("ot3", 480, "2026-04-12", 300));
		await saveEntry(ot("ot4", 480, "2026-04-15", 400));
		await saveEntry(ot("ot5", 480, "2026-04-20", 500));
		// 5 × 8h = 40h banked. Plan 5 × 8h time off.

		const dates = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08"];
		const memberOT = (await listEntries("m1")).filter((e) => e.kind === "overtime");
		const { newTimeoffs, updatedOvertime } = simulateBatchPlan(memberOT, dates, 480);

		await commitTimeoffBatchWithConsumption(newTimeoffs, updatedOvertime);

		const after = await listEntries("m1");
		const finalOT = after.filter((e) => e.kind === "overtime");
		// Every OT entry should be fully settled.
		expect(finalOT.every(isSettled)).toBe(true);
		expect(openOvertimeMin(finalOT)).toBe(0);
		// Five new time-off entries exist.
		expect(after.filter((e) => e.kind === "timeoff")).toHaveLength(5);
	});

	it("partially consumes a single OT entry when needed", async () => {
		await saveEntry(ot("ot1", 480, "2026-04-01", 100)); // 8h
		await saveEntry(ot("ot2", 480, "2026-04-05", 200)); // 8h, total 16h
		// Plan 3 × 4h = 12h: ot1 fully consumed (8h), ot2 partially consumed (4h of 8h).

		const dates = ["2026-05-04", "2026-05-05", "2026-05-06"];
		const memberOT = (await listEntries("m1")).filter((e) => e.kind === "overtime");
		const { newTimeoffs, updatedOvertime } = simulateBatchPlan(memberOT, dates, 240);

		await commitTimeoffBatchWithConsumption(newTimeoffs, updatedOvertime);

		const after = await listEntries("m1");
		const ot1 = after.find((e) => e.id === "ot1");
		const ot2 = after.find((e) => e.id === "ot2");
		expect(ot1?.consumedMin).toBe(480); // fully consumed
		expect(ot2?.consumedMin).toBe(240); // half consumed
		expect(after.filter((e) => e.kind === "timeoff")).toHaveLength(3);
	});

	it("throws InsufficientHoursError when the bank can't cover the batch", async () => {
		await saveEntry(ot("ot1", 240, "2026-04-01", 100)); // only 4h banked
		const memberOT = (await listEntries("m1")).filter((e) => e.kind === "overtime");
		// Try to plan 2 × 8h = 16h.
		expect(() => simulateBatchPlan(memberOT, ["2026-05-04", "2026-05-05"], 480)).toThrow(
			InsufficientHoursError
		);
	});

	it("links each timeoff's consumptions back to the right OT entries", async () => {
		await saveEntry(ot("ot1", 480, "2026-04-01", 100));
		await saveEntry(ot("ot2", 480, "2026-04-10", 200));
		// 16h banked. Plan 3 × 6h = 18h... actually total exceeds. Use 3 × 4h = 12h.

		const dates = ["2026-05-04", "2026-05-05", "2026-05-06"];
		const memberOT = (await listEntries("m1")).filter((e) => e.kind === "overtime");
		const { newTimeoffs, updatedOvertime } = simulateBatchPlan(memberOT, dates, 240);

		await commitTimeoffBatchWithConsumption(newTimeoffs, updatedOvertime);

		const after = await listEntries("m1");
		const timeoffs = after
			.filter((e) => e.kind === "timeoff")
			.sort((a, b) => (a.date < b.date ? -1 : 1));
		// First day consumes 4h from ot1
		expect(timeoffs[0].consumptions).toEqual([{ overtimeEntryId: "ot1", consumedMin: 240 }]);
		// Second day consumes 4h from ot1 (4h remaining)
		expect(timeoffs[1].consumptions).toEqual([{ overtimeEntryId: "ot1", consumedMin: 240 }]);
		// Third day finishes ot1 (0h) and starts on ot2... wait ot1 has 8h, so days 1+2 consume all of it
		// Day 3 should be entirely on ot2 — but wait, day 2 leaves 0 on ot1, so day 3 hits ot2 for 4h
		expect(timeoffs[2].consumptions).toEqual([{ overtimeEntryId: "ot2", consumedMin: 240 }]);
	});
});
