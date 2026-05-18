import { CheckIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select";
import { useShiftVault } from "@/data/DataProvider";
import { TeamHasMembersError } from "@/lib/db";
import { newId } from "@/lib/id";
import { suggestNextTeamColor, TEAM_COLOR_ORDER, TEAM_COLORS } from "@/lib/teamColor";
import { cn } from "@/lib/utils";
import type { Team, TeamColor } from "@/types";

export function TeamsManager() {
	const { teams, members, addTeam, updateTeam, removeTeam } = useShiftVault();
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [draftName, setDraftName] = useState("");

	function memberCountFor(teamId: string): number {
		return members.filter((m) => m.teamId === teamId).length;
	}

	async function handleCreate() {
		const name = draftName.trim();
		if (!name) return;
		if (teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
			toast.error("A team with that name already exists");
			return;
		}
		const team: Team = {
			id: newId(),
			name,
			color: suggestNextTeamColor(teams.map((t) => t.color)),
			sortOrder: teams.length,
			createdAt: Date.now()
		};
		await addTeam(team);
		setDraftName("");
		toast.success(`Team "${name}" created`);
	}

	async function handleSaveName(team: Team) {
		const name = editName.trim();
		if (!name) {
			setEditingId(null);
			return;
		}
		if (teams.some((t) => t.id !== team.id && t.name.toLowerCase() === name.toLowerCase())) {
			toast.error("A team with that name already exists");
			return;
		}
		await updateTeam({ ...team, name });
		setEditingId(null);
		toast.success("Team renamed");
	}

	async function handleColorChange(team: Team, color: TeamColor) {
		await updateTeam({ ...team, color });
	}

	async function handleDelete(team: Team) {
		try {
			await removeTeam(team.id);
			toast.success(`Team "${team.name}" deleted`);
		} catch (err) {
			if (err instanceof TeamHasMembersError) {
				toast.error("Can't delete this team", { description: err.message });
			} else {
				toast.error("Couldn't delete the team");
			}
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<ul aria-label="Teams" className="flex flex-col gap-2">
				{teams.map((team) => {
					const isEditing = editingId === team.id;
					const count = memberCountFor(team.id);
					const color = team.color ? TEAM_COLORS[team.color] : null;
					return (
						<li
							key={team.id}
							className="border-border bg-background flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"
						>
							<span
								aria-hidden="true"
								className="size-3 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-background"
								style={{
									backgroundColor: color?.bg ?? "var(--color-muted)",
									boxShadow: color ? `0 0 0 2px ${color.ring}` : undefined
								}}
							/>
							{isEditing ? (
								<>
									<Input
										value={editName}
										onChange={(e) => setEditName(e.target.value)}
										className="h-8 flex-1 min-w-[8rem]"
										autoFocus
										onKeyDown={(e) => {
											if (e.key === "Enter") handleSaveName(team);
											if (e.key === "Escape") setEditingId(null);
										}}
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label="Save"
										className="size-8"
										onClick={() => handleSaveName(team)}
									>
										<CheckIcon className="size-4" />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label="Cancel"
										className="size-8"
										onClick={() => setEditingId(null)}
									>
										<XIcon className="size-4" />
									</Button>
								</>
							) : (
								<>
									<span className="flex-1 truncate text-sm font-medium">{team.name}</span>
									<span className="text-muted-foreground text-xs">
										{count} {count === 1 ? "member" : "members"}
									</span>
									<Select
										value={team.color ?? ""}
										onValueChange={(v) => handleColorChange(team, v as TeamColor)}
									>
										<SelectTrigger
											size="sm"
											className="w-[7.5rem]"
											aria-label={`Color for ${team.name}`}
										>
											<SelectValue placeholder="Color" />
										</SelectTrigger>
										<SelectContent>
											{TEAM_COLOR_ORDER.map((c) => {
												const usedByOther = teams.some((t) => t.id !== team.id && t.color === c);
												return (
													<SelectItem key={c} value={c} disabled={usedByOther}>
														<span
															aria-hidden="true"
															className="size-2.5 rounded-full"
															style={{ backgroundColor: TEAM_COLORS[c].bg }}
														/>
														{TEAM_COLORS[c].label}
														{usedByOther ? " (in use)" : ""}
													</SelectItem>
												);
											})}
										</SelectContent>
									</Select>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label={`Rename ${team.name}`}
										className="text-muted-foreground size-8"
										onClick={() => {
											setEditingId(team.id);
											setEditName(team.name);
										}}
									>
										<PencilIcon className="size-3.5" />
									</Button>
									<ConfirmDialog
										trigger={
											<Button
												type="button"
												variant="ghost"
												size="icon"
												aria-label={`Delete ${team.name}`}
												className={cn(
													"text-muted-foreground hover:text-destructive size-8",
													count > 0 && "cursor-not-allowed opacity-50"
												)}
												disabled={count > 0}
											>
												<Trash2Icon className="size-3.5" />
											</Button>
										}
										title={`Delete "${team.name}"?`}
										description="The team and any custom color will be removed. Members assigned to this team must be moved first."
										confirmLabel="Delete team"
										tone="destructive"
										onConfirm={() => handleDelete(team)}
									/>
								</>
							)}
						</li>
					);
				})}
			</ul>

			<form
				className="flex flex-wrap items-center gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					handleCreate();
				}}
			>
				<Input
					value={draftName}
					onChange={(e) => setDraftName(e.target.value)}
					placeholder="New team name (e.g. Engineering)"
					className="h-9 flex-1 min-w-[10rem]"
				/>
				<Button type="submit" disabled={!draftName.trim()}>
					<PlusIcon aria-hidden="true" />
					Add team
				</Button>
			</form>
			<p className="text-muted-foreground text-xs">
				Teams group members into separate views. With one team you'll see a flat workspace; with
				multiple, a tab bar appears on every page.
			</p>
		</div>
	);
}
