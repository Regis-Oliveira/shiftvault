import { describe, expect, it } from "vitest";

import { countWorkdaysInRange, expandRangeToWorkdays } from "@/lib/workdays";

function d(iso: string): Date {
	const [y, m, day] = iso.split("-").map(Number);
	return new Date(y, m - 1, day);
}

describe("expandRangeToWorkdays", () => {
	it("returns a single date for a single-day range", () => {
		expect(expandRangeToWorkdays(d("2026-05-14"), d("2026-05-14"), true)).toEqual(["2026-05-14"]);
	});

	it("excludes weekends by default", () => {
		// May 14, 2026 is Thursday. Range Thu→Mon covers Fri, skips Sat+Sun, includes Mon.
		expect(expandRangeToWorkdays(d("2026-05-14"), d("2026-05-18"), true)).toEqual([
			"2026-05-14",
			"2026-05-15",
			"2026-05-18"
		]);
	});

	it("includes weekends when excludeWeekends is false", () => {
		expect(expandRangeToWorkdays(d("2026-05-14"), d("2026-05-18"), false)).toEqual([
			"2026-05-14",
			"2026-05-15",
			"2026-05-16",
			"2026-05-17",
			"2026-05-18"
		]);
	});

	it("auto-swaps reversed ranges", () => {
		expect(expandRangeToWorkdays(d("2026-05-18"), d("2026-05-14"), true)).toEqual([
			"2026-05-14",
			"2026-05-15",
			"2026-05-18"
		]);
	});

	it("crosses month boundaries", () => {
		// Apr 30, 2026 is Thursday. Range Apr 30 → May 4 (Mon) → 3 workdays.
		expect(expandRangeToWorkdays(d("2026-04-30"), d("2026-05-04"), true)).toEqual([
			"2026-04-30",
			"2026-05-01",
			"2026-05-04"
		]);
	});

	it("returns empty when the entire range is weekend and weekends are excluded", () => {
		// May 16+17, 2026 = Saturday + Sunday
		expect(expandRangeToWorkdays(d("2026-05-16"), d("2026-05-17"), true)).toEqual([]);
	});

	it("returns one entry per day on a single-day weekend when included", () => {
		expect(expandRangeToWorkdays(d("2026-05-17"), d("2026-05-17"), false)).toEqual(["2026-05-17"]);
	});

	it("excludes dates listed in the holidays set", () => {
		// Thu May 14 → Tue May 19, excluding weekends. Mark May 15 (Fri) + May 18 (Mon) as holidays.
		const holidays = new Set(["2026-05-15", "2026-05-18"]);
		expect(expandRangeToWorkdays(d("2026-05-14"), d("2026-05-19"), true, holidays)).toEqual([
			"2026-05-14",
			"2026-05-19"
		]);
	});

	it("treats holidays on weekends as no-ops when weekends are already excluded", () => {
		// May 16 is Saturday — already excluded; marking it a holiday changes nothing.
		const holidays = new Set(["2026-05-16"]);
		expect(expandRangeToWorkdays(d("2026-05-14"), d("2026-05-18"), true, holidays)).toEqual([
			"2026-05-14",
			"2026-05-15",
			"2026-05-18"
		]);
	});

	it("removes weekend holidays when weekends are included in the range", () => {
		// Same range with weekends included — the Saturday holiday now drops out.
		const holidays = new Set(["2026-05-16"]);
		expect(expandRangeToWorkdays(d("2026-05-14"), d("2026-05-18"), false, holidays)).toEqual([
			"2026-05-14",
			"2026-05-15",
			"2026-05-17",
			"2026-05-18"
		]);
	});

	it("returns empty when every workday in the range is a holiday", () => {
		const holidays = new Set(["2026-05-14", "2026-05-15", "2026-05-18"]);
		expect(expandRangeToWorkdays(d("2026-05-14"), d("2026-05-18"), true, holidays)).toEqual([]);
	});
});

describe("countWorkdaysInRange", () => {
	it("matches the length of expandRangeToWorkdays", () => {
		expect(countWorkdaysInRange(d("2026-05-01"), d("2026-05-31"), true)).toBe(
			expandRangeToWorkdays(d("2026-05-01"), d("2026-05-31"), true).length
		);
	});
});
