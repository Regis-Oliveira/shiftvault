import { PlusIcon } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useShiftVault } from "@/data/DataProvider";
import { newId } from "@/lib/id";
import { suggestNextTeamColor, TEAM_COLOR_ORDER, TEAM_COLORS } from "@/lib/teamColor";
import { cn } from "@/lib/utils";
import type { Team, TeamColor } from "@/types";

interface CreateTeamDialogProps {
	trigger: ReactNode;
}

export function CreateTeamDialog({ trigger }: CreateTeamDialogProps) {
	const { teams, addTeam, setActiveTeamId } = useShiftVault();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const trimmed = name.trim();
	const usedColors = new Set(teams.map((t) => t.color).filter((c): c is TeamColor => Boolean(c)));
	const allColorsTaken = usedColors.size >= TEAM_COLOR_ORDER.length;
	const suggested = suggestNextTeamColor(teams.map((t) => t.color));
	const [color, setColor] = useState<TeamColor>(suggested);

	// When the dialog opens (or the used-color set shifts while open), realign the
	// selection to the suggested unused color so the form always starts in a valid state.
	useEffect(() => {
		if (open) setColor(suggested);
	}, [open, suggested]);

	function handleOpenChange(next: boolean) {
		setOpen(next);
		if (!next) {
			setName("");
			setSubmitting(false);
		}
	}

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		if (!trimmed) return;
		if (teams.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
			toast.error("A team with that name already exists");
			return;
		}
		if (!allColorsTaken && usedColors.has(color)) {
			toast.error("That color is already used by another team");
			return;
		}
		setSubmitting(true);
		try {
			const team: Team = {
				id: newId(),
				name: trimmed,
				color,
				sortOrder: teams.length,
				createdAt: Date.now()
			};
			await addTeam(team);
			setActiveTeamId(team.id);
			toast.success(`Team "${trimmed}" created`);
			handleOpenChange(false);
		} catch {
			toast.error("Couldn't create the team");
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create team</DialogTitle>
					<DialogDescription>
						Group members into a separate team. Each team gets its own color — colors already in use
						are dimmed.
					</DialogDescription>
				</DialogHeader>
				<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
					<div className="flex flex-col gap-2">
						<Label htmlFor="new-team-name">Name</Label>
						<Input
							id="new-team-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Engineering"
							autoFocus
							autoComplete="off"
						/>
					</div>
					<fieldset className="flex flex-col gap-2">
						<legend className="text-sm font-medium">Color</legend>
						<div className="grid grid-cols-4 gap-2">
							{TEAM_COLOR_ORDER.map((c) => {
								const isUsed = !allColorsTaken && usedColors.has(c);
								const isSelected = color === c;
								return (
									<label
										key={c}
										className={cn(
											"inline-flex items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs font-medium transition-colors",
											"has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
											isSelected
												? "bg-accent border-foreground/40 ring-ring/40 ring-2"
												: "border-border bg-card hover:bg-accent",
											isUsed ? "cursor-not-allowed opacity-40 hover:bg-card" : "cursor-pointer"
										)}
									>
										<input
											type="radio"
											name="team-color"
											value={c}
											checked={isSelected}
											disabled={isUsed}
											onChange={() => setColor(c)}
											className="sr-only"
										/>
										<span
											aria-hidden="true"
											className="size-3 rounded-full"
											style={{ backgroundColor: TEAM_COLORS[c].bg }}
										/>
										<span className="truncate">
											{TEAM_COLORS[c].label}
											{isUsed ? " (used)" : ""}
										</span>
									</label>
								);
							})}
						</div>
						{allColorsTaken ? (
							<p className="text-muted-foreground text-xs">
								All eight palette colors are already in use — pick any to share with an existing
								team.
							</p>
						) : null}
					</fieldset>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={!trimmed || submitting}>
							<PlusIcon aria-hidden="true" />
							Create team
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
