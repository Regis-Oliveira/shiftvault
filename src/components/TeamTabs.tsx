import { LayersIcon, PlusIcon } from "lucide-react";

import { CreateTeamDialog } from "@/components/CreateTeamDialog";
import { ALL_TEAMS, useShiftVault } from "@/data/DataProvider";
import { TEAM_COLORS } from "@/lib/teamColor";
import { cn } from "@/lib/utils";

export function TeamTabs() {
	const { teams, activeTeamId, setActiveTeamId, members } = useShiftVault();
	if (teams.length === 0) return null;

	const showAllTeams = teams.length >= 2;
	const tabs = [
		...(showAllTeams
			? [{ id: ALL_TEAMS, name: "All teams", color: undefined, count: members.length }]
			: []),
		...teams.map((t) => ({
			id: t.id,
			name: t.name,
			color: t.color,
			count: members.filter((m) => m.teamId === t.id).length
		}))
	];

	return (
		<nav aria-label="Team filter" className="flex flex-wrap items-center gap-2">
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
			<CreateTeamDialog
				trigger={
					<button
						type="button"
						className={cn(
							"border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent",
							"inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-sm font-medium transition-colors",
							"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
						)}
					>
						<PlusIcon aria-hidden="true" className="size-3.5" />
						<span>New team</span>
					</button>
				}
			/>
		</nav>
	);
}
