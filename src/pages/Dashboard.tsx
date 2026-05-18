import { FileTextIcon, PlusIcon, SearchIcon, TrendingUpIcon, UsersRoundIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { EmptyStateCard } from "@/components/EmptyStateCard";
import { MemberCard } from "@/components/MemberCard";
import { MemberFormDialog } from "@/components/MemberFormDialog";
import { StatCard } from "@/components/StatCard";
import { TeamTabs } from "@/components/TeamTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	ALL_TEAMS,
	useArchivedMembers,
	useShiftVault,
	useVisibleMembers
} from "@/data/DataProvider";
import { formatMinutes, memberBalance } from "@/lib/hours";
import { pluralize } from "@/lib/pluralize";
import { matchMembers } from "@/lib/searchMembers";

export function DashboardPage() {
	const { isLoading, entriesForMember, teams, activeTeamId } = useShiftVault();
	const members = useVisibleMembers();
	const archived = useArchivedMembers();
	const [searchQuery, setSearchQuery] = useState("");
	const [showArchived, setShowArchived] = useState(false);

	// Team-aware noun: when a team is active (or there's exactly one team), borrow its name;
	// otherwise fall back to "Member". `settings.memberLabel` only still drives the member-add
	// form + CSV exports — it's no longer the source of truth for Dashboard CTAs.
	const activeTeam = activeTeamId === ALL_TEAMS ? null : teams.find((t) => t.id === activeTeamId);
	const singleTeam = teams.length === 1 ? teams[0] : null;
	const label = activeTeam?.name ?? singleTeam?.name ?? "Member";
	const pluralLabel = pluralize(label);
	const filteredMembers = matchMembers(searchQuery, members);

	if (isLoading) {
		return (
			<div className="mx-auto max-w-7xl space-y-8" aria-busy="true">
				<header className="space-y-2">
					<p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
						Hours bank
					</p>
					<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Loading workspace…</h1>
				</header>
			</div>
		);
	}

	if (members.length === 0) {
		return (
			<div className="mx-auto max-w-7xl space-y-8">
				<DashboardHeader label={label} pluralLabel={pluralLabel} />
				<TeamTabs />
				<EmptyStateCard
					icon={UsersRoundIcon}
					title={`No ${pluralLabel.toLowerCase()} yet`}
					description={`Add your first ${label.toLowerCase()} to start logging overtime and time off.`}
					action={
						<MemberFormDialog
							mode="create"
							memberLabel={label}
							trigger={
								<Button size="lg">
									<PlusIcon aria-hidden="true" />
									Add your first {label.toLowerCase()}
								</Button>
							}
						/>
					}
				/>
			</div>
		);
	}

	const totalBalance = members.reduce((sum, m) => sum + memberBalance(entriesForMember(m.id)), 0);
	const positiveCount = members.filter((m) => memberBalance(entriesForMember(m.id)) > 0).length;

	return (
		<div className="mx-auto max-w-7xl space-y-8">
			<DashboardHeader label={label} pluralLabel={pluralLabel} />

			<TeamTabs />

			<section aria-label="Workspace summary" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<StatCard
					icon={<UsersRoundIcon aria-hidden="true" className="size-4" />}
					label={pluralLabel}
					value={String(members.length)}
				/>
				<StatCard
					icon={<FileTextIcon aria-hidden="true" className="size-4" />}
					label="Total balance"
					value={formatMinutes(totalBalance)}
				/>
				<StatCard
					icon={<TrendingUpIcon aria-hidden="true" className="size-4" />}
					label="With positive balance"
					value={String(positiveCount)}
				/>
			</section>

			<div className="relative max-w-sm">
				<SearchIcon
					aria-hidden="true"
					className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
				/>
				<Input
					type="search"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder={`Search ${pluralLabel.toLowerCase()} by name or email`}
					className="pl-9"
					aria-label={`Search ${pluralLabel.toLowerCase()}`}
				/>
			</div>

			{filteredMembers.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No {pluralLabel.toLowerCase()} match <span className="font-medium">"{searchQuery}"</span>.
				</p>
			) : (
				<section
					aria-label={`${pluralLabel} list`}
					className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
				>
					{filteredMembers.map((member) => (
						<MemberCard key={member.id} member={member} entries={entriesForMember(member.id)} />
					))}
				</section>
			)}

			{archived.length > 0 ? (
				<section aria-label="Archived members" className="border-border space-y-4 border-t pt-6">
					<button
						type="button"
						onClick={() => setShowArchived((v) => !v)}
						aria-expanded={showArchived}
						className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
					>
						<span>
							Archived ({archived.length}) {showArchived ? "▾" : "▸"}
						</span>
					</button>
					{showArchived ? (
						<div className="grid grid-cols-1 gap-4 opacity-70 sm:grid-cols-2 lg:grid-cols-3">
							{archived.map((member) => (
								<MemberCard key={member.id} member={member} entries={entriesForMember(member.id)} />
							))}
						</div>
					) : null}
				</section>
			) : null}
		</div>
	);
}

function DashboardHeader({ label, pluralLabel }: { label: string; pluralLabel: string }) {
	const { settings } = useShiftVault();
	return (
		<header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div className="space-y-2">
				<p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
					Hours bank
				</p>
				<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
					{settings.workspaceName}
				</h1>
				<p className="text-muted-foreground max-w-prose text-sm">
					Track overtime and time off across your {pluralLabel.toLowerCase()}. Everything is stored
					privately in your browser.
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Button asChild variant="outline">
					<Link to="/reports">
						<FileTextIcon aria-hidden="true" />
						Monthly report
					</Link>
				</Button>
				<MemberFormDialog
					mode="create"
					memberLabel={label}
					trigger={
						<Button>
							<PlusIcon aria-hidden="true" />
							New {label.toLowerCase()}
						</Button>
					}
				/>
			</div>
		</header>
	);
}
