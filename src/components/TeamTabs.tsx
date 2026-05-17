import { LayersIcon } from "lucide-react";

import { ALL_TEAMS, useShiftVault } from "@/data/DataProvider";
import { TEAM_COLORS } from "@/lib/teamColor";
import { cn } from "@/lib/utils";

/**
 * Tab bar above page content. Hidden when only one team exists (so single-team workspaces
 * — like the QA Manager's — never see the tabs). Wires straight to DataProvider's
 * `activeTeamId` so navigating between pages keeps the same team filter.
 */
export function TeamTabs() {
	const { teams, activeTeamId, setActiveTeamId, members } = useShiftVault();
	if (teams.length <= 1) return null;

	const tabs = [
		{ id: ALL_TEAMS, name: "All teams", color: undefined, count: members.length },
		...teams.map((t) => ({
			id: t.id,
			name: t.name,
			color: t.color,
			count: members.filter((m) => m.teamId === t.id).length
		}))
	];

	return (
		<nav
			aria-label="Team filter"
			className="-mx-2 flex items-center gap-1 overflow-x-auto px-2 pb-1"
		>
			{tabs.map((tab) => {
				const isActive = activeTeamId === tab.id;
				const colorTokens = tab.color ? TEAM_COLORS[tab.color] : null;
				return (
					<button
						key={tab.id}
						type="button"
						onClick={() => setActiveTeamId(tab.id)}
						aria-pressed={isActive}
						className={cn(
							"inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
							"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
							isActive
								? "bg-primary text-primary-foreground border-transparent shadow-[var(--shadow-soft)]"
								: "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent"
						)}
					>
						{tab.id === ALL_TEAMS ? (
							<LayersIcon aria-hidden="true" className="size-3.5" />
						) : (
							<span
								aria-hidden="true"
								className="size-2.5 rounded-full"
								style={{ backgroundColor: colorTokens?.bg ?? "var(--color-muted)" }}
							/>
						)}
						<span>{tab.name}</span>
						<span
							className={cn(
								"rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
								isActive
									? "bg-primary-foreground/10 text-primary-foreground"
									: "bg-muted text-muted-foreground"
							)}
						>
							{tab.count}
						</span>
					</button>
				);
			})}
		</nav>
	);
}
