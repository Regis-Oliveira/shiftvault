/**
 * Naive English plural for the workspace's configurable `memberLabel`.
 * Handles the common "y → ies" case; everything else gets a trailing "s".
 * Returns "Members" for empty input.
 */
export function pluralize(label: string): string {
	if (!label) return "Members";
	if (label.endsWith("s")) return label;
	if (label.endsWith("y")) return `${label.slice(0, -1)}ies`;
	return `${label}s`;
}
