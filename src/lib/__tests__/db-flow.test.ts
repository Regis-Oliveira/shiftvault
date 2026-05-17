/**
 * End-to-end IDB flow tests for the settlement model — exercises the same paths
 * the DataProvider hits when adding / removing time-off entries.
 */
import { describe, expect, it } from "vitest";

import {
	commitTimeoffDeletionWithRestore,
	commitTimeoffWithConsumption,
	listEntries,
	saveEntry
} from "@/lib/db";
import { isSettled, planConsumption, planRestoration } from "@/lib/settlement";
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

function timeoff(id: string, durationMin: number, date: string): Entry {
	return {
		id,
		memberId: "m1",
		kind: "timeoff",
		date,
		durationMin,
		consumptions: [],
		createdAt: 0
	};
}

describe("settlement IDB round-trip", () => {
	it("FIFO consumes oldest first across two OT entries and persists", async () => {
		await saveEntry(ot("a", 60, "2026-05-01", 100));
		await saveEntry(ot("b", 60, "2026-05-05", 200));

		const memberOT = (await listEntries("m1")).filter((e) => e.kind === "overtime");
		const plan = planConsumption(memberOT, 90);
		const to = { ...timeoff("t1", 90, "2026-05-10"), consumptions: plan.consumptions };
		await commitTimeoffWithConsumption(to, plan.updatedOvertime);

		const after = await listEntries("m1");
		const aAfter = after.find((e) => e.id === "a");
		const bAfter = after.find((e) => e.id === "b");
		const toAfter = after.find((e) => e.id === "t1");
		expect(aAfter?.consumedMin).toBe(60);
		expect(isSettled(aAfter as Entry)).toBe(true);
		expect(bAfter?.consumedMin).toBe(30);
		expect(toAfter?.consumptions).toEqual([
			{ overtimeEntryId: "a", consumedMin: 60 },
			{ overtimeEntryId: "b", consumedMin: 30 }
		]);
	});

	it("deleting the time-off restores the consumed minutes on referenced OTs", async () => {
		await saveEntry(ot("a", 60, "2026-05-01", 100));
		await saveEntry(ot("b", 60, "2026-05-05", 200));
		const memberOT = (await listEntries("m1")).filter((e) => e.kind === "overtime");
		const plan = planConsumption(memberOT, 90);
		const to = { ...timeoff("t1", 90, "2026-05-10"), consumptions: plan.consumptions };
		await commitTimeoffWithConsumption(to, plan.updatedOvertime);

		const before = (await listEntries("m1")).filter((e) => e.kind === "overtime");
		const restored = planRestoration(before, plan.consumptions);
		await commitTimeoffDeletionWithRestore("t1", restored);

		const after = await listEntries("m1");
		expect(after.find((e) => e.id === "t1")).toBeUndefined();
		expect(after.find((e) => e.id === "a")?.consumedMin).toBe(0);
		expect(after.find((e) => e.id === "b")?.consumedMin).toBe(0);
	});
});
