import type { TeamColor } from "@/types";

/** Resolved OKLCH values for each team-color slot. Used by chips and tab bars. */
export const TEAM_COLORS: Record<TeamColor, { bg: string; ring: string; label: string }> = {
	slate: { bg: "oklch(0.72 0.02 250)", ring: "oklch(0.5 0.04 250)", label: "Slate" },
	sky: { bg: "oklch(0.72 0.12 230)", ring: "oklch(0.55 0.18 230)", label: "Sky" },
	emerald: { bg: "oklch(0.72 0.14 152)", ring: "oklch(0.55 0.18 152)", label: "Emerald" },
	amber: { bg: "oklch(0.78 0.13 75)", ring: "oklch(0.6 0.17 60)", label: "Amber" },
	rose: { bg: "oklch(0.72 0.14 15)", ring: "oklch(0.55 0.2 15)", label: "Rose" },
	violet: { bg: "oklch(0.7 0.15 295)", ring: "oklch(0.55 0.2 295)", label: "Violet" },
	teal: { bg: "oklch(0.72 0.1 195)", ring: "oklch(0.55 0.15 195)", label: "Teal" },
	fuchsia: { bg: "oklch(0.72 0.18 325)", ring: "oklch(0.58 0.22 325)", label: "Fuchsia" }
};

export const TEAM_COLOR_ORDER: TeamColor[] = [
	"slate",
	"sky",
	"emerald",
	"amber",
	"rose",
	"violet",
	"teal",
	"fuchsia"
];

/** Pick the next color in the palette for a new team, given existing teams' colors. */
export function suggestNextTeamColor(usedColors: Array<TeamColor | undefined>): TeamColor {
	const used = new Set(usedColors.filter((c): c is TeamColor => Boolean(c)));
	for (const c of TEAM_COLOR_ORDER) {
		if (!used.has(c)) return c;
	}
	// All colors used — cycle back.
	return TEAM_COLOR_ORDER[usedColors.length % TEAM_COLOR_ORDER.length];
}
