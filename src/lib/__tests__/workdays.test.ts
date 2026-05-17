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
});

describe("countWorkdaysInRange", () => {
	it("matches the length of expandRangeToWorkdays", () => {
		expect(countWorkdaysInRange(d("2026-05-01"), d("2026-05-31"), true)).toBe(
			expandRangeToWorkdays(d("2026-05-01"), d("2026-05-31"), true).length
		);
	});
});
