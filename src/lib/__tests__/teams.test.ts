import { describe, expect, it } from "vitest";

import {
	deleteTeam,
	ensureDefaultTeam,
	exportAll,
	importAll,
	listMembers,
	listTeams,
	saveEntry,
	saveMember,
	saveTeam,
	TeamHasMembersError
} from "@/lib/db";
import type { Entry, Member, Team } from "@/types";

function team(overrides: Partial<Team> = {}): Team {
	return {
		id: overrides.id ?? "team-1",
		name: overrides.name ?? "Engineering",
		sortOrder: overrides.sortOrder ?? 0,
		createdAt: overrides.createdAt ?? 1000,
		...overrides
	};
}

function member(overrides: Partial<Member> = {}): Member {
	return {
		id: overrides.id ?? "m1",
		name: overrides.name ?? "Régis",
		email: overrides.email ?? "regis@example.com",
		teamId: overrides.teamId ?? "team-1",
		createdAt: overrides.createdAt ?? 1000,
		...overrides
	};
}

describe("teams: ensureDefaultTeam", () => {
	it("creates a default team on an empty workspace", async () => {
		const result = await ensureDefaultTeam();
		expect(result.name).toBe("Default");
		const all = await listTeams();
		expect(all).toHaveLength(1);
		expect(all[0].id).toBe(result.id);
	});

	it("returns the existing first team when teams already exist", async () => {
		await saveTeam(team({ id: "qa", name: "QA", sortOrder: 0, createdAt: 100 }));
		await saveTeam(team({ id: "eng", name: "Engineering", sortOrder: 1, createdAt: 200 }));
		const result = await ensureDefaultTeam();
		expect(result.id).toBe("qa");
		const all = await listTeams();
		expect(all).toHaveLength(2);
	});
});

describe("teams: listTeams ordering", () => {
	it("sorts by sortOrder ascending, then createdAt as tiebreaker", async () => {
		await saveTeam(team({ id: "c", name: "C", sortOrder: 2, createdAt: 100 }));
		await saveTeam(team({ id: "b", name: "B", sortOrder: 1, createdAt: 200 }));
		await saveTeam(team({ id: "a", name: "A", sortOrder: 0, createdAt: 300 }));
		await saveTeam(team({ id: "b2", name: "B2", sortOrder: 1, createdAt: 150 }));
		const all = await listTeams();
		expect(all.map((t) => t.id)).toEqual(["a", "b2", "b", "c"]);
	});
});

describe("teams: deleteTeam guard", () => {
	it("deletes a team that has no members", async () => {
		await saveTeam(team({ id: "empty", name: "Empty" }));
		await deleteTeam("empty");
		expect(await listTeams()).toHaveLength(0);
	});

	it("throws TeamHasMembersError when members are still assigned", async () => {
		await saveTeam(team({ id: "qa", name: "QA" }));
		await saveMember(member({ id: "m1", teamId: "qa" }));
		await saveMember(member({ id: "m2", teamId: "qa", email: "other@example.com" }));
		await expect(deleteTeam("qa")).rejects.toThrow(TeamHasMembersError);
		try {
			await deleteTeam("qa");
		} catch (err) {
			if (err instanceof TeamHasMembersError) {
				expect(err.memberCount).toBe(2);
			}
		}
	});
});

describe("export / import with teams", () => {
	it("exports v3 payload with teams array", async () => {
		await saveTeam(team({ id: "qa", name: "QA" }));
		await saveMember(member({ teamId: "qa" }));
		const payload = await exportAll();
		expect(payload.schemaVersion).toBe(4);
		expect(payload.teams?.map((t) => t.id)).toEqual(["qa"]);
	});

	it("auto-creates a Default team when importing a v2 payload without teams", async () => {
		// Simulate a pre-v3 export — members lack teamId, payload has no `teams`.
		const v2Payload = {
			schemaVersion: 2 as const,
			exportedAt: Date.now(),
			members: [
				{
					id: "legacy",
					name: "Legacy",
					email: "legacy@example.com",
					createdAt: 500
				} as unknown as Member
			],
			entries: [] as Entry[],
			settings: {
				id: "app" as const,
				themeMode: "system" as const,
				memberLabel: "Member",
				workspaceName: "ShiftVault",
				maxBalanceMin: 48 * 60
			}
		};
		await importAll(v2Payload, "replace");

		const teams = await listTeams();
		expect(teams).toHaveLength(1);
		expect(teams[0].name).toBe("Default");

		const members = await listMembers();
		expect(members[0].teamId).toBe(teams[0].id);
	});

	it("preserves teams + member.teamId on v3 round-trip", async () => {
		await saveTeam(team({ id: "qa", name: "QA" }));
		await saveTeam(team({ id: "eng", name: "Engineering", sortOrder: 1, createdAt: 2000 }));
		await saveMember(member({ id: "m1", teamId: "qa" }));
		await saveMember(member({ id: "m2", teamId: "eng", email: "other@example.com" }));
		const payload = await exportAll();

		await importAll(payload, "replace");
		const teams = await listTeams();
		const members = await listMembers();
		expect(teams.map((t) => t.id).sort()).toEqual(["eng", "qa"]);
		expect(members.find((m) => m.id === "m1")?.teamId).toBe("qa");
		expect(members.find((m) => m.id === "m2")?.teamId).toBe("eng");
	});
});

describe("teams: entries are unaffected by team assignment", () => {
	it("listEntries returns all entries regardless of member's team", async () => {
		await saveTeam(team({ id: "qa", name: "QA" }));
		await saveMember(member({ id: "m1", teamId: "qa" }));
		await saveEntry({
			id: "e1",
			memberId: "m1",
			kind: "overtime",
			date: "2026-05-01",
			durationMin: 60,
			consumedMin: 0,
			createdAt: 1
		});
		const { listEntries } = await import("@/lib/db");
		const entries = await listEntries();
		expect(entries).toHaveLength(1);
	});
});
