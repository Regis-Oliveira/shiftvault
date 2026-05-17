import { describe, expect, it } from "vitest";

import { entriesInRange, groupEntriesByDate, toIsoDate } from "@/lib/entries";
import type { Entry } from "@/types";

function entry(overrides: Partial<Entry> = {}): Entry {
	return {
		id: overrides.id ?? "x",
		memberId: overrides.memberId ?? "m",
		kind: overrides.kind ?? "overtime",
		date: overrides.date ?? "2026-05-10",
		durationMin: overrides.durationMin ?? 60,
		createdAt: overrides.createdAt ?? 0,
		...overrides
	};
}

describe("toIsoDate", () => {
	it("zero-pads month and day", () => {
		expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
		expect(toIsoDate(new Date(2026, 9, 15))).toBe("2026-10-15");
	});

	it("uses local-time year/month/day (avoids UTC shift)", () => {
		// 23:00 on May 10 local — would slip to May 11 if naively using toISOString()
		const lateNight = new Date(2026, 4, 10, 23, 0, 0);
		expect(toIsoDate(lateNight)).toBe("2026-05-10");
	});
});

describe("groupEntriesByDate", () => {
	it("groups entries by their date string", () => {
		const entries = [
			entry({ id: "a", date: "2026-05-10" }),
			entry({ id: "b", date: "2026-05-10", kind: "timeoff" }),
			entry({ id: "c", date: "2026-05-11" })
		];
		const grouped = groupEntriesByDate(entries);
		expect(
			grouped
				.get("2026-05-10")
				?.map((e) => e.id)
				.sort()
		).toEqual(["a", "b"]);
		expect(grouped.get("2026-05-11")?.map((e) => e.id)).toEqual(["c"]);
		expect(grouped.get("2026-05-12")).toBeUndefined();
	});

	it("returns an empty map for no entries", () => {
		expect(groupEntriesByDate([]).size).toBe(0);
	});
});

describe("entriesInRange", () => {
	it("includes entries on the start and end dates (inclusive)", () => {
		const entries = [
			entry({ id: "before", date: "2026-04-30" }),
			entry({ id: "start", date: "2026-05-01" }),
			entry({ id: "middle", date: "2026-05-15" }),
			entry({ id: "end", date: "2026-05-31" }),
			entry({ id: "after", date: "2026-06-01" })
		];
		const inRange = entriesInRange(entries, new Date(2026, 4, 1), new Date(2026, 4, 31));
		expect(inRange.map((e) => e.id).sort()).toEqual(["end", "middle", "start"]);
	});
});
