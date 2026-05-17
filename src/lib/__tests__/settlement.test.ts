import { describe, expect, it } from "vitest";

import {
	availableMin,
	InsufficientHoursError,
	isSettled,
	openOvertimeMin,
	planConsumption,
	planRestoration,
	settledOvertimeMin
} from "@/lib/settlement";
import type { Entry } from "@/types";

function ot(overrides: Partial<Entry> = {}): Entry {
	return {
		id: overrides.id ?? "ot1",
		memberId: overrides.memberId ?? "m1",
		kind: "overtime",
		date: overrides.date ?? "2026-05-01",
		durationMin: overrides.durationMin ?? 60,
		consumedMin: overrides.consumedMin ?? 0,
		createdAt: overrides.createdAt ?? 0,
		...overrides
	};
}

describe("availableMin / isSettled", () => {
	it("returns the unconsumed minutes", () => {
		expect(availableMin(ot({ durationMin: 120, consumedMin: 30 }))).toBe(90);
	});

	it("treats undefined consumedMin as 0", () => {
		expect(availableMin(ot({ durationMin: 60, consumedMin: undefined }))).toBe(60);
	});

	it("isSettled is true only when fully consumed", () => {
		expect(isSettled(ot({ durationMin: 60, consumedMin: 60 }))).toBe(true);
		expect(isSettled(ot({ durationMin: 60, consumedMin: 59 }))).toBe(false);
		expect(isSettled(ot({ durationMin: 60, consumedMin: 0 }))).toBe(false);
	});
});

describe("openOvertimeMin / settledOvertimeMin", () => {
	it("sums the available and consumed parts across entries", () => {
		const entries = [
			ot({ id: "a", durationMin: 60, consumedMin: 60 }),
			ot({ id: "b", durationMin: 120, consumedMin: 30 }),
			ot({ id: "c", durationMin: 90, consumedMin: 0 })
		];
		expect(openOvertimeMin(entries)).toBe(0 + 90 + 90);
		expect(settledOvertimeMin(entries)).toBe(60 + 30 + 0);
	});

	it("ignores non-overtime entries", () => {
		const timeoff: Entry = {
			id: "t1",
			memberId: "m1",
			kind: "timeoff",
			date: "2026-05-01",
			durationMin: 60,
			createdAt: 0
		};
		expect(openOvertimeMin([timeoff])).toBe(0);
		expect(settledOvertimeMin([timeoff])).toBe(0);
	});
});

describe("planConsumption FIFO", () => {
	it("returns no-op plan when requesting 0", () => {
		const plan = planConsumption([ot({ durationMin: 60 })], 0);
		expect(plan.consumedTotalMin).toBe(0);
		expect(plan.consumptions).toEqual([]);
		expect(plan.updatedOvertime).toEqual([]);
	});

	it("consumes a single OT entry exactly", () => {
		const ot1 = ot({ id: "a", durationMin: 60 });
		const plan = planConsumption([ot1], 60);
		expect(plan.consumptions).toEqual([{ overtimeEntryId: "a", consumedMin: 60 }]);
		expect(plan.updatedOvertime).toHaveLength(1);
		expect(plan.updatedOvertime[0].consumedMin).toBe(60);
	});

	it("consumes oldest first when multiple OT entries exist", () => {
		const entries = [
			ot({ id: "newer", date: "2026-05-10", durationMin: 60 }),
			ot({ id: "older", date: "2026-05-01", durationMin: 60 })
		];
		const plan = planConsumption(entries, 30);
		expect(plan.consumptions).toEqual([{ overtimeEntryId: "older", consumedMin: 30 }]);
		expect(plan.updatedOvertime[0].id).toBe("older");
		expect(plan.updatedOvertime[0].consumedMin).toBe(30);
	});

	it("walks across multiple entries when one isn't enough", () => {
		const entries = [
			ot({ id: "a", date: "2026-05-01", durationMin: 60 }),
			ot({ id: "b", date: "2026-05-05", durationMin: 60 }),
			ot({ id: "c", date: "2026-05-10", durationMin: 60 })
		];
		const plan = planConsumption(entries, 90);
		expect(plan.consumptions).toEqual([
			{ overtimeEntryId: "a", consumedMin: 60 },
			{ overtimeEntryId: "b", consumedMin: 30 }
		]);
		// 'c' shouldn't be touched
		expect(plan.updatedOvertime.map((e) => e.id)).toEqual(["a", "b"]);
		expect(plan.updatedOvertime[0].consumedMin).toBe(60);
		expect(plan.updatedOvertime[1].consumedMin).toBe(30);
	});

	it("respects already-consumed minutes on partially settled entries", () => {
		const entries = [
			ot({ id: "a", date: "2026-05-01", durationMin: 60, consumedMin: 40 }), // 20 available
			ot({ id: "b", date: "2026-05-05", durationMin: 60, consumedMin: 0 }) // 60 available
		];
		const plan = planConsumption(entries, 50);
		expect(plan.consumptions).toEqual([
			{ overtimeEntryId: "a", consumedMin: 20 },
			{ overtimeEntryId: "b", consumedMin: 30 }
		]);
		expect(plan.updatedOvertime[0].consumedMin).toBe(60);
		expect(plan.updatedOvertime[1].consumedMin).toBe(30);
	});

	it("skips fully-settled entries when computing availability", () => {
		const entries = [
			ot({ id: "done", date: "2026-05-01", durationMin: 60, consumedMin: 60 }),
			ot({ id: "open", date: "2026-05-05", durationMin: 60 })
		];
		const plan = planConsumption(entries, 40);
		expect(plan.consumptions).toEqual([{ overtimeEntryId: "open", consumedMin: 40 }]);
	});

	it("throws InsufficientHoursError when the bank is too small", () => {
		const entries = [ot({ id: "a", durationMin: 30 })];
		expect(() => planConsumption(entries, 60)).toThrow(InsufficientHoursError);
		try {
			planConsumption(entries, 60);
		} catch (err) {
			if (err instanceof InsufficientHoursError) {
				expect(err.requestedMin).toBe(60);
				expect(err.availableMin).toBe(30);
			}
		}
	});

	it("uses createdAt as a tiebreaker when dates match", () => {
		const entries = [
			ot({ id: "newer", date: "2026-05-01", createdAt: 200, durationMin: 60 }),
			ot({ id: "older", date: "2026-05-01", createdAt: 100, durationMin: 60 })
		];
		const plan = planConsumption(entries, 30);
		expect(plan.consumptions[0].overtimeEntryId).toBe("older");
	});
});

describe("planRestoration", () => {
	it("decrements consumedMin on the referenced OT entries", () => {
		const entries = [
			ot({ id: "a", durationMin: 60, consumedMin: 60 }),
			ot({ id: "b", durationMin: 60, consumedMin: 20 })
		];
		const restored = planRestoration(entries, [
			{ overtimeEntryId: "a", consumedMin: 60 },
			{ overtimeEntryId: "b", consumedMin: 20 }
		]);
		const byId = new Map(restored.map((e) => [e.id, e]));
		expect(byId.get("a")?.consumedMin).toBe(0);
		expect(byId.get("b")?.consumedMin).toBe(0);
	});

	it("clamps to 0 if consumption data is corrupt (over-restore)", () => {
		const entries = [ot({ id: "a", durationMin: 60, consumedMin: 30 })];
		const restored = planRestoration(entries, [{ overtimeEntryId: "a", consumedMin: 60 }]);
		expect(restored[0].consumedMin).toBe(0);
	});

	it("silently skips consumptions whose OT no longer exists", () => {
		const restored = planRestoration([], [{ overtimeEntryId: "ghost", consumedMin: 30 }]);
		expect(restored).toEqual([]);
	});

	it("returns empty for empty input", () => {
		expect(planRestoration([], [])).toEqual([]);
	});
});
