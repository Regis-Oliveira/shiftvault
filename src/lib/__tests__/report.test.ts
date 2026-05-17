import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "@/lib/db";
import {
	buildReport,
	csvCell,
	formatMonthString,
	historyToCsv,
	isValidMonthString,
	parseMonthString,
	reportFilenameSlug,
	toCsv
} from "@/lib/report";
import type { Entry, Member } from "@/types";

function member(overrides: Partial<Member> = {}): Member {
	return {
		id: overrides.id ?? "m1",
		name: overrides.name ?? "Régis",
		email: overrides.email ?? "regis@example.com",
		teamId: overrides.teamId ?? "default-team",
		createdAt: overrides.createdAt ?? 1000,
		...overrides
	};
}

function entry(overrides: Partial<Entry> = {}): Entry {
	return {
		id: overrides.id ?? "e1",
		memberId: overrides.memberId ?? "m1",
		kind: overrides.kind ?? "overtime",
		date: overrides.date ?? "2026-05-10",
		durationMin: overrides.durationMin ?? 60,
		createdAt: overrides.createdAt ?? 0,
		...overrides
	};
}

describe("parseMonthString / formatMonthString", () => {
	it("round-trips a month string", () => {
		const date = parseMonthString("2026-05");
		expect(date.getFullYear()).toBe(2026);
		expect(date.getMonth()).toBe(4);
		expect(date.getDate()).toBe(1);
		expect(formatMonthString(date)).toBe("2026-05");
	});

	it("zero-pads single-digit months", () => {
		expect(formatMonthString(new Date(2026, 0, 1))).toBe("2026-01");
	});
});

describe("isValidMonthString", () => {
	it("accepts well-formed YYYY-MM strings", () => {
		expect(isValidMonthString("2026-01")).toBe(true);
		expect(isValidMonthString("2026-12")).toBe(true);
	});

	it("rejects empty strings", () => {
		expect(isValidMonthString("")).toBe(false);
	});

	it("rejects malformed strings", () => {
		expect(isValidMonthString("2026/05")).toBe(false);
		expect(isValidMonthString("2026-5")).toBe(false);
		expect(isValidMonthString("26-05")).toBe(false);
	});

	it("rejects invalid month numbers", () => {
		expect(isValidMonthString("2026-00")).toBe(false);
		expect(isValidMonthString("2026-13")).toBe(false);
	});
});

describe("buildReport", () => {
	it("throws RangeError for invalid month inputs", () => {
		expect(() => buildReport("", "2026-05", [], [], [], DEFAULT_SETTINGS)).toThrow(RangeError);
		expect(() => buildReport("2026-05", "bad", [], [], [], DEFAULT_SETTINGS)).toThrow(RangeError);
	});

	it("only includes entries within the requested single month", () => {
		const members = [member({ id: "m1", name: "Willian" })];
		const entries = [
			entry({ id: "before", memberId: "m1", date: "2026-04-30" }),
			entry({ id: "start", memberId: "m1", date: "2026-05-01", durationMin: 60 }),
			entry({ id: "mid", memberId: "m1", date: "2026-05-15", kind: "timeoff", durationMin: 30 }),
			entry({ id: "end", memberId: "m1", date: "2026-05-31", durationMin: 90 }),
			entry({ id: "after", memberId: "m1", date: "2026-06-01" })
		];
		const report = buildReport("2026-05", "2026-05", ["m1"], members, entries, DEFAULT_SETTINGS);

		expect(report.period.label).toBe("May 2026");
		expect(report.members[0].entries.map((e) => e.id)).toEqual(["start", "mid", "end"]);
		expect(report.totals).toEqual({
			overtimeMin: 150,
			timeoffMin: 30,
			balanceMin: 120,
			entryCount: 3,
			memberCount: 1
		});
	});

	it("includes entries spanning multiple months when given a range", () => {
		const members = [member({ id: "m1", name: "Willian" })];
		const entries = [
			entry({ id: "feb", memberId: "m1", date: "2026-02-28" }),
			entry({ id: "mar", memberId: "m1", date: "2026-03-15", durationMin: 60 }),
			entry({ id: "apr", memberId: "m1", date: "2026-04-10", durationMin: 90 }),
			entry({ id: "may", memberId: "m1", date: "2026-05-05", durationMin: 30 }),
			entry({ id: "jun", memberId: "m1", date: "2026-06-01" })
		];
		const report = buildReport("2026-03", "2026-05", ["m1"], members, entries, DEFAULT_SETTINGS);

		expect(report.period.label).toBe("March 2026 — May 2026");
		expect(report.period.fromIso).toBe("2026-03-01");
		expect(report.period.toIso).toBe("2026-05-31");
		expect(report.members[0].entries.map((e) => e.id)).toEqual(["mar", "apr", "may"]);
		expect(report.totals.overtimeMin).toBe(180);
	});

	it("auto-swaps a reversed range so the period reads from earlier to later", () => {
		const report = buildReport("2026-05", "2026-03", [], [], [], DEFAULT_SETTINGS);
		expect(report.period.fromMonth).toBe("2026-03");
		expect(report.period.toMonth).toBe("2026-05");
		expect(report.period.label).toBe("March 2026 — May 2026");
	});

	it("excludes members that aren't in the selected set", () => {
		const members = [member({ id: "m1", name: "A" }), member({ id: "m2", name: "B" })];
		const entries = [
			entry({ id: "e1", memberId: "m1", date: "2026-05-01" }),
			entry({ id: "e2", memberId: "m2", date: "2026-05-02" })
		];
		const report = buildReport("2026-05", "2026-05", ["m1"], members, entries, DEFAULT_SETTINGS);
		expect(report.members.map((m) => m.memberId)).toEqual(["m1"]);
		expect(report.totals.entryCount).toBe(1);
	});

	it("handles an empty selection", () => {
		const report = buildReport("2026-05", "2026-05", [], [], [], DEFAULT_SETTINGS);
		expect(report.members).toEqual([]);
		expect(report.totals.memberCount).toBe(0);
	});
});

describe("reportFilenameSlug", () => {
	it("returns the month directly for a single-month report", () => {
		const report = buildReport("2026-05", "2026-05", [], [], [], DEFAULT_SETTINGS);
		expect(reportFilenameSlug(report)).toBe("2026-05");
	});

	it("joins both months for a multi-month report", () => {
		const report = buildReport("2026-03", "2026-05", [], [], [], DEFAULT_SETTINGS);
		expect(reportFilenameSlug(report)).toBe("2026-03_to_2026-05");
	});
});

describe("csvCell", () => {
	it("returns plain strings unchanged", () => {
		expect(csvCell("hello")).toBe("hello");
		expect(csvCell(42)).toBe("42");
	});

	it("wraps strings with commas in quotes", () => {
		expect(csvCell("a, b, c")).toBe('"a, b, c"');
	});

	it("escapes embedded quotes by doubling them", () => {
		expect(csvCell('she said "hi"')).toBe('"she said ""hi"""');
	});

	it("wraps strings with newlines in quotes", () => {
		expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
	});

	it("returns empty for null/undefined", () => {
		expect(csvCell(null)).toBe("");
		expect(csvCell(undefined)).toBe("");
	});
});

describe("toCsv", () => {
	it("uses the single month as the period column", () => {
		const members = [member({ id: "m1", name: "Willian" })];
		const entries = [
			entry({
				id: "e1",
				memberId: "m1",
				date: "2026-05-01",
				durationMin: 90,
				taskUrl: "https://example.com/X-1"
			})
		];
		const report = buildReport("2026-05", "2026-05", ["m1"], members, entries, DEFAULT_SETTINGS);
		const csv = toCsv(report);
		const lines = csv.split("\n");
		expect(lines[0]).toBe(
			"workspace,period,member,kind,date,duration_min,duration_hours,task_url,timeoff_reason,note"
		);
		expect(lines[1]).toBe(
			"ShiftVault,2026-05,Willian,overtime,2026-05-01,90,1h 30m,https://example.com/X-1,,"
		);
	});

	it("uses a 'from..to' period column for multi-month reports", () => {
		const members = [member({ id: "m1", name: "Willian" })];
		const entries = [entry({ id: "e1", memberId: "m1", date: "2026-04-15", durationMin: 60 })];
		const report = buildReport("2026-03", "2026-05", ["m1"], members, entries, DEFAULT_SETTINGS);
		const csv = toCsv(report);
		expect(csv).toContain("ShiftVault,2026-03..2026-05,Willian,overtime,2026-04-15");
	});

	it("emits one empty-entry row for members with no entries in the period", () => {
		const members = [member({ id: "m1", name: "Idle" })];
		const report = buildReport("2026-05", "2026-05", ["m1"], members, [], DEFAULT_SETTINGS);
		const lines = toCsv(report).split("\n");
		expect(lines).toHaveLength(2);
		expect(lines[1]).toBe("ShiftVault,2026-05,Idle,,,,,,,");
	});

	it("quote-escapes note fields containing commas", () => {
		const members = [member({ id: "m1", name: "Régis" })];
		const entries = [
			entry({
				id: "e1",
				memberId: "m1",
				date: "2026-05-01",
				durationMin: 60,
				note: "hotfix, prod outage"
			})
		];
		const report = buildReport("2026-05", "2026-05", ["m1"], members, entries, DEFAULT_SETTINGS);
		const csv = toCsv(report);
		expect(csv).toContain('"hotfix, prod outage"');
	});
});

describe("historyToCsv", () => {
	it("emits the full header even when there are no entries", () => {
		const csv = historyToCsv("ShiftVault", [], []);
		const lines = csv.split("\n");
		expect(lines).toHaveLength(1);
		expect(lines[0]).toBe(
			"workspace,member,email,kind,status,date,duration_min,duration_hours,consumed_min,task_url,timeoff_reason,note,created_at"
		);
	});

	it("sorts entries by date then createdAt ascending", () => {
		const members = [member({ id: "m1", name: "Willian" })];
		const entries = [
			entry({ id: "later", memberId: "m1", date: "2026-05-15", createdAt: 200 }),
			entry({ id: "first", memberId: "m1", date: "2026-05-01", createdAt: 100 }),
			entry({ id: "tieB", memberId: "m1", date: "2026-05-10", createdAt: 300 }),
			entry({ id: "tieA", memberId: "m1", date: "2026-05-10", createdAt: 200 })
		];
		const csv = historyToCsv("ShiftVault", members, entries);
		const dataLines = csv.split("\n").slice(1);
		// Should be: 2026-05-01, 2026-05-10 (createdAt 200), 2026-05-10 (300), 2026-05-15
		const dates = dataLines.map((l) => l.split(",")[5]);
		expect(dates).toEqual(["2026-05-01", "2026-05-10", "2026-05-10", "2026-05-15"]);
	});

	it("derives status from consumedMin: open / partial / settled / withdrawn", () => {
		const members = [member({ id: "m1", name: "Willian" })];
		const entries = [
			entry({ id: "open", memberId: "m1", durationMin: 60, consumedMin: 0, date: "2026-05-01" }),
			entry({
				id: "partial",
				memberId: "m1",
				durationMin: 60,
				consumedMin: 30,
				date: "2026-05-02"
			}),
			entry({
				id: "settled",
				memberId: "m1",
				durationMin: 60,
				consumedMin: 60,
				date: "2026-05-03"
			}),
			entry({
				id: "to",
				memberId: "m1",
				kind: "timeoff",
				durationMin: 30,
				date: "2026-05-04"
			})
		];
		const csv = historyToCsv("ShiftVault", members, entries);
		const statuses = csv
			.split("\n")
			.slice(1)
			.map((l) => l.split(",")[4]);
		expect(statuses).toEqual(["open", "partial", "settled", "withdrawn"]);
	});

	it("falls back to <deleted> when an entry's member is missing", () => {
		const entries = [entry({ id: "e1", memberId: "ghost", date: "2026-05-01" })];
		const csv = historyToCsv("ShiftVault", [], entries);
		expect(csv).toContain(",<deleted>,,");
	});

	it("quote-escapes note fields containing commas", () => {
		const members = [member({ id: "m1", name: "Régis" })];
		const entries = [
			entry({ id: "e1", memberId: "m1", date: "2026-05-01", note: "hotfix, prod outage" })
		];
		const csv = historyToCsv("ShiftVault", members, entries);
		expect(csv).toContain('"hotfix, prod outage"');
	});

	it("includes the member email so HR can match across workspaces", () => {
		const members = [member({ id: "m1", name: "Willian", email: "willian@example.com" })];
		const entries = [entry({ id: "e1", memberId: "m1", date: "2026-05-01" })];
		const csv = historyToCsv("ShiftVault", members, entries);
		expect(csv).toContain("willian@example.com");
	});
});
