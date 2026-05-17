import { describe, expect, it } from "vitest";

import { formatMinutes, memberBalance, totalOvertime, totalTimeOff } from "@/lib/hours";
import type { Entry } from "@/types";

function entry(partial: Partial<Entry>): Entry {
	return {
		id: partial.id ?? "x",
		memberId: partial.memberId ?? "m",
		kind: partial.kind ?? "overtime",
		date: partial.date ?? "2026-05-01",
		durationMin: partial.durationMin ?? 0,
		createdAt: partial.createdAt ?? 0,
		...partial
	};
}

describe("formatMinutes", () => {
	it("formats whole hours", () => {
		expect(formatMinutes(60)).toBe("1h 00m");
		expect(formatMinutes(180)).toBe("3h 00m");
	});

	it("formats hours and minutes with zero-padding", () => {
		expect(formatMinutes(75)).toBe("1h 15m");
		expect(formatMinutes(5)).toBe("0h 05m");
	});

	it("handles zero", () => {
		expect(formatMinutes(0)).toBe("0h 00m");
	});

	it("formats negative balances with a leading minus", () => {
		expect(formatMinutes(-90)).toBe("-1h 30m");
		expect(formatMinutes(-5)).toBe("-0h 05m");
	});
});

describe("memberBalance", () => {
	it("returns 0 for no entries", () => {
		expect(memberBalance([])).toBe(0);
	});

	it("adds overtime and subtracts time off", () => {
		const entries: Entry[] = [
			entry({ kind: "overtime", durationMin: 120 }),
			entry({ kind: "overtime", durationMin: 60 }),
			entry({ kind: "timeoff", durationMin: 45 })
		];
		expect(memberBalance(entries)).toBe(135);
	});

	it("can go negative when time off exceeds overtime", () => {
		const entries: Entry[] = [
			entry({ kind: "overtime", durationMin: 30 }),
			entry({ kind: "timeoff", durationMin: 90 })
		];
		expect(memberBalance(entries)).toBe(-60);
	});
});

describe("totalOvertime / totalTimeOff", () => {
	it("sums only the matching kind", () => {
		const entries: Entry[] = [
			entry({ kind: "overtime", durationMin: 30 }),
			entry({ kind: "overtime", durationMin: 90 }),
			entry({ kind: "timeoff", durationMin: 60 })
		];
		expect(totalOvertime(entries)).toBe(120);
		expect(totalTimeOff(entries)).toBe(60);
	});
});
