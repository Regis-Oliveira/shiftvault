import { describe, expect, it } from "vitest";

import { matchMembers } from "@/lib/searchMembers";
import type { Member } from "@/types";

function member(overrides: Partial<Member> & { id: string; name: string; email: string }): Member {
	return {
		id: overrides.id,
		name: overrides.name,
		email: overrides.email,
		teamId: overrides.teamId ?? "team-default",
		createdAt: overrides.createdAt ?? 0,
		avatarBase64: overrides.avatarBase64
	};
}

const ALICE = member({ id: "1", name: "Alice Wonder", email: "alice@acme.com" });
const BOB = member({ id: "2", name: "Bob Builder", email: "bob@build.io" });
const CAROL = member({ id: "3", name: "Carol Stone", email: "carol@stone.co" });

describe("matchMembers", () => {
	it("returns the full list for an empty query", () => {
		expect(matchMembers("", [ALICE, BOB, CAROL])).toEqual([ALICE, BOB, CAROL]);
	});

	it("returns the full list when the query is only whitespace", () => {
		expect(matchMembers("   ", [ALICE, BOB, CAROL])).toEqual([ALICE, BOB, CAROL]);
	});

	it("matches by name case-insensitively", () => {
		expect(matchMembers("alic", [ALICE, BOB, CAROL])).toEqual([ALICE]);
		expect(matchMembers("WONDER", [ALICE, BOB, CAROL])).toEqual([ALICE]);
	});

	it("matches by email substring", () => {
		expect(matchMembers("build.io", [ALICE, BOB, CAROL])).toEqual([BOB]);
		expect(matchMembers("@stone", [ALICE, BOB, CAROL])).toEqual([CAROL]);
	});

	it("returns an empty array when nothing matches", () => {
		expect(matchMembers("nobody", [ALICE, BOB, CAROL])).toEqual([]);
	});

	it("trims the query before matching", () => {
		expect(matchMembers("  bob  ", [ALICE, BOB, CAROL])).toEqual([BOB]);
	});
});
