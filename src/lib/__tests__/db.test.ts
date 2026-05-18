import { describe, expect, it } from "vitest";

import {
	DEFAULT_SETTINGS,
	deleteEntry,
	deleteMember,
	exportAll,
	importAll,
	listEntries,
	listMembers,
	loadSettings,
	saveEntry,
	saveMember,
	saveSettings,
	wipeAll
} from "@/lib/db";
import type { Entry, Member } from "@/types";

function buildMember(overrides: Partial<Member> = {}): Member {
	return {
		id: overrides.id ?? "member-1",
		name: overrides.name ?? "Willian",
		email: overrides.email ?? "willian@example.com",
		teamId: overrides.teamId ?? "default-team",
		createdAt: overrides.createdAt ?? 1000,
		...overrides
	};
}

function buildEntry(overrides: Partial<Entry> = {}): Entry {
	return {
		id: overrides.id ?? "entry-1",
		memberId: overrides.memberId ?? "member-1",
		kind: overrides.kind ?? "overtime",
		date: overrides.date ?? "2026-05-01",
		durationMin: overrides.durationMin ?? 60,
		taskUrl: overrides.taskUrl ?? "https://example.com/JIRA-1",
		createdAt: overrides.createdAt ?? 2000,
		...overrides
	};
}

describe("db: members", () => {
	it("saves and lists members ordered by createdAt", async () => {
		await saveMember(buildMember({ id: "a", name: "Alice", createdAt: 200 }));
		await saveMember(buildMember({ id: "b", name: "Bob", createdAt: 100 }));
		const members = await listMembers();
		expect(members.map((m) => m.id)).toEqual(["b", "a"]);
	});

	it("deleting a member cascades to their entries", async () => {
		await saveMember(buildMember({ id: "m1" }));
		await saveEntry(buildEntry({ id: "e1", memberId: "m1" }));
		await saveEntry(buildEntry({ id: "e2", memberId: "m1", date: "2026-05-02" }));
		await saveMember(buildMember({ id: "m2", name: "Other" }));
		await saveEntry(buildEntry({ id: "e3", memberId: "m2" }));

		await deleteMember("m1");

		const members = await listMembers();
		const entries = await listEntries();
		expect(members.map((m) => m.id)).toEqual(["m2"]);
		expect(entries.map((e) => e.id)).toEqual(["e3"]);
	});
});

describe("db: entries", () => {
	it("saves entries and lists them newest-first by date", async () => {
		await saveEntry(buildEntry({ id: "e1", date: "2026-05-01" }));
		await saveEntry(buildEntry({ id: "e2", date: "2026-05-10" }));
		await saveEntry(buildEntry({ id: "e3", date: "2026-04-20" }));

		const entries = await listEntries();
		expect(entries.map((e) => e.id)).toEqual(["e2", "e1", "e3"]);
	});

	it("filters entries by memberId via the by-member index", async () => {
		await saveEntry(buildEntry({ id: "e1", memberId: "m1" }));
		await saveEntry(buildEntry({ id: "e2", memberId: "m2" }));
		await saveEntry(buildEntry({ id: "e3", memberId: "m1", date: "2026-05-02" }));

		const m1Entries = await listEntries("m1");
		expect(m1Entries.map((e) => e.id).sort()).toEqual(["e1", "e3"]);
	});

	it("deleteEntry removes the record from IndexedDB", async () => {
		await saveEntry(buildEntry({ id: "e1" }));
		await saveEntry(buildEntry({ id: "e2", date: "2026-05-02" }));
		expect((await listEntries()).map((e) => e.id).sort()).toEqual(["e1", "e2"]);

		await deleteEntry("e1");

		const after = await listEntries();
		expect(after.map((e) => e.id)).toEqual(["e2"]);
		expect(after.find((e) => e.id === "e1")).toBeUndefined();
	});
});

describe("db: settings", () => {
	it("returns DEFAULT_SETTINGS when nothing is stored", async () => {
		const settings = await loadSettings();
		expect(settings).toEqual(DEFAULT_SETTINGS);
	});

	it("round-trips a saved settings object", async () => {
		await saveSettings({
			id: "app",
			themeMode: "dark",
			memberLabel: "QA",
			workspaceName: "Team A",
			maxBalanceMin: 60 * 40
		});
		const settings = await loadSettings();
		expect(settings.themeMode).toBe("dark");
		expect(settings.memberLabel).toBe("QA");
		expect(settings.maxBalanceMin).toBe(2400);
	});
});

describe("db: export / import / wipe", () => {
	it("exports a payload that can be re-imported in replace mode", async () => {
		await saveMember(buildMember({ id: "m1", name: "Régis" }));
		await saveEntry(buildEntry({ id: "e1", memberId: "m1" }));
		await saveSettings({ ...DEFAULT_SETTINGS, memberLabel: "QA" });

		const payload = await exportAll();
		expect(payload.schemaVersion).toBe(4);
		expect(payload.members).toHaveLength(1);
		expect(payload.entries).toHaveLength(1);
		expect(payload.settings.memberLabel).toBe("QA");

		await wipeAll();
		expect(await listMembers()).toHaveLength(0);
		expect(await listEntries()).toHaveLength(0);

		await importAll(payload, "replace");
		const restoredMembers = await listMembers();
		const restoredEntries = await listEntries();
		expect(restoredMembers.map((m) => m.id)).toEqual(["m1"]);
		expect(restoredEntries.map((e) => e.id)).toEqual(["e1"]);
	});

	it("merge mode preserves existing records and adds new ones", async () => {
		await saveMember(buildMember({ id: "m1", name: "Original" }));

		await importAll(
			{
				schemaVersion: 1,
				exportedAt: Date.now(),
				members: [buildMember({ id: "m2", name: "Imported" })],
				entries: [],
				settings: DEFAULT_SETTINGS
			},
			"merge"
		);

		const members = await listMembers();
		expect(members.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
	});
});
