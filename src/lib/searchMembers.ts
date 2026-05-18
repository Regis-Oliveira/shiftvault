import type { Member } from "@/types";

/**
 * Filter a member list by a free-text query. Matches against `name` and `email`
 * case-insensitively. Empty / whitespace queries return the input unchanged.
 *
 * Kept tiny and dependency-free so it's trivial to test and reuse across the
 * Dashboard member grid and the Reports member checklist.
 */
export function matchMembers(query: string, members: Member[]): Member[] {
	const q = query.trim().toLowerCase();
	if (!q) return members;
	return members.filter((m) => {
		const name = m.name.toLowerCase();
		const email = m.email.toLowerCase();
		return name.includes(q) || email.includes(q);
	});
}
