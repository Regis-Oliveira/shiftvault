import { describe, expect, it } from "vitest";

import { buildReconciliation, defaultReconcileSelection } from "@/lib/reconcile";
import type { Entry, Member } from "@/types";

function member(overrides: Partial<Member> & { id: string; email: string }): Member {
	return {
		id: overrides.id,
		name: overrides.name ?? `Person ${overrides.id}`,
		email: overrides.email,
		teamId: overrides.teamId ?? "team-default",
		createdAt: overrides.createdAt ?? 0,
		avatarBase64: overrides.avatarBase64
	};
}

function entry(overrides: Partial<Entry> & { id: string; memberId: string; date: string }): Entry {
	return {
		id: overrides.id,
		memberId: overrides.memberId,
		kind: overrides.kind ?? "overtime",
		date: overrides.date,
		durationMin: overrides.durationMin ?? 60,
		taskUrl: overrides.taskUrl,
		note: overrides.note,
		createdAt: overrides.createdAt ?? 0,
		consumedMin: overrides.consumedMin,
		consumptions: overrides.consumptions,
		timeoffReason: overrides.timeoffReason
	};
}

describe("buildReconciliation", () => {
	it("matches members by lowercased email", () => {
		const local = [member({ id: "L1", email: "Alice@Example.com" })];
		const imported = [member({ id: "R1", email: "alice@example.com" })];
		const result = buildReconciliation(local, [], imported, []);
		expect(result.matched).toHaveLength(1);
		expect(result.matched[0].local.id).toBe("L1");
		expect(result.matched[0].imported.id).toBe("R1");
		expect(result.unmatched).toHaveLength(0);
	});

	it("reports imported members with no local email match as unmatched", () => {
		const local = [member({ id: "L1", email: "alice@example.com" })];
		const imported = [
			member({ id: "R1", email: "alice@example.com" }),
			member({ id: "R2", email: "bob@example.com" })
		];
		const importedEntries = [entry({ id: "E1", memberId: "R2", date: "2026-05-10" })];
		const result = buildReconciliation(local, [], imported, importedEntries);
		expect(result.matched).toHaveLength(1);
		expect(result.unmatched).toHaveLength(1);
		expect(result.unmatched[0].imported.id).toBe("R2");
		expect(result.unmatched[0].entryCount).toBe(1);
		expect(result.totals.unmatchedMembers).toBe(1);
	});

	it("never matches on empty email", () => {
		const local = [member({ id: "L1", email: "" })];
		const imported = [member({ id: "R1", email: "" })];
		const result = buildReconciliation(local, [], imported, []);
		expect(result.matched).toHaveLength(0);
		expect(result.unmatched).toHaveLength(1);
	});

	it("classifies entries as new, duplicate, or conflict by (kind, date, durationMin)", () => {
		const local = [member({ id: "L1", email: "alice@example.com" })];
		const imported = [member({ id: "R1", email: "alice@example.com" })];
		const localEntries = [
			entry({ id: "LE1", memberId: "L1", date: "2026-05-10", durationMin: 60, kind: "overtime" }),
			entry({ id: "LE2", memberId: "L1", date: "2026-05-11", durationMin: 90, kind: "overtime" })
		];
		const importedEntries = [
			// Same date+kind+duration → duplicate
			entry({ id: "IE1", memberId: "R1", date: "2026-05-10", durationMin: 60, kind: "overtime" }),
			// Same date+kind but different duration → conflict
			entry({ id: "IE2", memberId: "R1", date: "2026-05-11", durationMin: 120, kind: "overtime" }),
			// Brand new date → new
			entry({ id: "IE3", memberId: "R1", date: "2026-05-12", durationMin: 45, kind: "overtime" })
		];
		const result = buildReconciliation(local, localEntries, imported, importedEntries);
		expect(result.matched).toHaveLength(1);
		const diff = result.matched[0];
		expect(diff.counts).toEqual({ new: 1, duplicate: 1, conflict: 1 });
		const byId = new Map(diff.entries.map((d) => [d.imported.id, d]));
		expect(byId.get("IE1")?.status).toBe("duplicate");
		expect(byId.get("IE2")?.status).toBe("conflict");
		expect(byId.get("IE3")?.status).toBe("new");
		expect(byId.get("IE1")?.localMatch?.id).toBe("LE1");
		expect(byId.get("IE2")?.localMatch?.id).toBe("LE2");
		expect(byId.get("IE3")?.localMatch).toBeUndefined();
	});

	it("treats same date with different kinds as new (not a conflict)", () => {
		const local = [member({ id: "L1", email: "alice@example.com" })];
		const imported = [member({ id: "R1", email: "alice@example.com" })];
		const localEntries = [
			entry({ id: "LE1", memberId: "L1", date: "2026-05-10", durationMin: 60, kind: "overtime" })
		];
		const importedEntries = [
			entry({ id: "IE1", memberId: "R1", date: "2026-05-10", durationMin: 60, kind: "timeoff" })
		];
		const result = buildReconciliation(local, localEntries, imported, importedEntries);
		expect(result.matched[0].counts).toEqual({ new: 1, duplicate: 0, conflict: 0 });
	});

	it("sorts diffed entries newest-first", () => {
		const local = [member({ id: "L1", email: "alice@example.com" })];
		const imported = [member({ id: "R1", email: "alice@example.com" })];
		const importedEntries = [
			entry({ id: "IE1", memberId: "R1", date: "2026-05-10" }),
			entry({ id: "IE2", memberId: "R1", date: "2026-05-15" }),
			entry({ id: "IE3", memberId: "R1", date: "2026-05-12" })
		];
		const result = buildReconciliation(local, [], imported, importedEntries);
		expect(result.matched[0].entries.map((d) => d.imported.id)).toEqual(["IE2", "IE3", "IE1"]);
	});

	it("aggregates totals across all matched members", () => {
		const local = [
			member({ id: "L1", email: "alice@example.com" }),
			member({ id: "L2", email: "bob@example.com" })
		];
		const imported = [
			member({ id: "R1", email: "alice@example.com" }),
			member({ id: "R2", email: "bob@example.com" }),
			member({ id: "R3", email: "carol@example.com" })
		];
		const importedEntries = [
			entry({ id: "IE1", memberId: "R1", date: "2026-05-10" }),
			entry({ id: "IE2", memberId: "R2", date: "2026-05-11" }),
			entry({ id: "IE3", memberId: "R3", date: "2026-05-12" })
		];
		const result = buildReconciliation(local, [], imported, importedEntries);
		expect(result.totals).toEqual({
			matchedMembers: 2,
			unmatchedMembers: 1,
			newEntries: 2,
			duplicateEntries: 0,
			conflictEntries: 0
		});
	});

	it("ignores local entries whose member is not in the imported set", () => {
		const local = [
			member({ id: "L1", email: "alice@example.com" }),
			member({ id: "L2", email: "bob@example.com" })
		];
		const imported = [member({ id: "R1", email: "alice@example.com" })];
		const localEntries = [entry({ id: "LE1", memberId: "L2", date: "2026-05-10" })];
		const importedEntries = [entry({ id: "IE1", memberId: "R1", date: "2026-05-10" })];
		const result = buildReconciliation(local, localEntries, imported, importedEntries);
		expect(result.matched[0].counts.new).toBe(1);
	});
});

describe("defaultReconcileSelection", () => {
	it("pre-checks only entries classified as new", () => {
		const local = [member({ id: "L1", email: "alice@example.com" })];
		const imported = [member({ id: "R1", email: "alice@example.com" })];
		const localEntries = [
			entry({ id: "LE1", memberId: "L1", date: "2026-05-10", durationMin: 60 }),
			entry({ id: "LE2", memberId: "L1", date: "2026-05-11", durationMin: 60 })
		];
		const importedEntries = [
			entry({ id: "IE1", memberId: "R1", date: "2026-05-10", durationMin: 60 }), // duplicate
			entry({ id: "IE2", memberId: "R1", date: "2026-05-11", durationMin: 120 }), // conflict
			entry({ id: "IE3", memberId: "R1", date: "2026-05-12", durationMin: 30 }) // new
		];
		const result = buildReconciliation(local, localEntries, imported, importedEntries);
		const selection = defaultReconcileSelection(result);
		expect(selection.has("IE3")).toBe(true);
		expect(selection.has("IE1")).toBe(false);
		expect(selection.has("IE2")).toBe(false);
		expect(selection.size).toBe(1);
	});
});
