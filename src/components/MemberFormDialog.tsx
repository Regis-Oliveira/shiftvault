import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { AvatarField } from "@/components/AvatarField";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select";
import { useShiftVault } from "@/data/DataProvider";
import { newId } from "@/lib/id";
import type { Member } from "@/types";

const schema = z.object({
	name: z.string().trim().min(1, "Name is required").max(60, "Name is too long"),
	email: z.string().trim().min(1, "Email is required").email("Use a valid email"),
	teamId: z.string().min(1, "Team is required"),
	avatarBase64: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

interface Props {
	mode: "create" | "edit";
	member?: Member;
	memberLabel: string;
	trigger: ReactNode;
}

export function MemberFormDialog({ mode, member, memberLabel, trigger }: Props) {
	const [open, setOpen] = useState(false);
	const { members, teams, activeTeamId, addMember, updateMember } = useShiftVault();
	const nameId = useId();
	const emailId = useId();
	const teamId = useId();

	// Pre-select: existing member's team → active team filter (if specific) → first team.
	const preselectedTeamId = (() => {
		if (member?.teamId) return member.teamId;
		if (activeTeamId && activeTeamId !== "__all__" && teams.some((t) => t.id === activeTeamId)) {
			return activeTeamId;
		}
		return teams[0]?.id ?? "";
	})();

	const form = useForm<FormValues>({
		resolver: zodResolver(schema),
		defaultValues: {
			name: member?.name ?? "",
			email: member?.email ?? "",
			teamId: preselectedTeamId,
			avatarBase64: member?.avatarBase64
		}
	});

	useEffect(() => {
		if (open) {
			form.reset({
				name: member?.name ?? "",
				email: member?.email ?? "",
				teamId: preselectedTeamId,
				avatarBase64: member?.avatarBase64
			});
		}
	}, [open, member, preselectedTeamId, form]);

	async function onSubmit(values: FormValues) {
		const normalisedEmail = values.email.toLowerCase();
		const conflict = members.find(
			(m) => m.email.toLowerCase() === normalisedEmail && m.id !== member?.id
		);
		if (conflict) {
			form.setError("email", {
				type: "manual",
				message: `Already used by ${conflict.name}.`
			});
			return;
		}

		if (mode === "edit" && member) {
			await updateMember({
				...member,
				name: values.name,
				email: normalisedEmail,
				teamId: values.teamId,
				avatarBase64: values.avatarBase64
			});
		} else {
			const created: Member = {
				id: newId(),
				name: values.name,
				email: normalisedEmail,
				teamId: values.teamId,
				avatarBase64: values.avatarBase64,
				createdAt: Date.now()
			};
			await addMember(created);
		}
		setOpen(false);
	}

	const nameValue = form.watch("name");
	const showTeamPicker = teams.length > 0;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{mode === "create"
							? `Add ${memberLabel.toLowerCase()}`
							: `Edit ${memberLabel.toLowerCase()}`}
					</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? `Create a new ${memberLabel.toLowerCase()}. Email is used to match records when sharing reports.`
							: `Update this ${memberLabel.toLowerCase()}'s details.`}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
					<Controller
						control={form.control}
						name="avatarBase64"
						render={({ field }) => (
							<AvatarField name={nameValue} value={field.value} onChange={field.onChange} />
						)}
					/>
					<div className="flex flex-col gap-2">
						<Label htmlFor={nameId}>Name</Label>
						<Input
							id={nameId}
							autoComplete="off"
							placeholder="e.g. Willian"
							aria-invalid={Boolean(form.formState.errors.name) || undefined}
							{...form.register("name")}
						/>
						{form.formState.errors.name ? (
							<p className="text-destructive text-xs" role="alert">
								{form.formState.errors.name.message}
							</p>
						) : null}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor={emailId}>Work email</Label>
						<Input
							id={emailId}
							type="email"
							autoComplete="off"
							placeholder="willian@yourcompany.com"
							aria-invalid={Boolean(form.formState.errors.email) || undefined}
							{...form.register("email")}
						/>
						{form.formState.errors.email ? (
							<p className="text-destructive text-xs" role="alert">
								{form.formState.errors.email.message}
							</p>
						) : (
							<p className="text-muted-foreground text-xs">
								Used to match this {memberLabel.toLowerCase()} when reconciling reports with HR.
							</p>
						)}
					</div>
					{showTeamPicker ? (
						<div className="flex flex-col gap-2">
							<Label htmlFor={teamId}>Team</Label>
							<Controller
								control={form.control}
								name="teamId"
								render={({ field }) => (
									<Select value={field.value} onValueChange={field.onChange}>
										<SelectTrigger
											id={teamId}
											className="w-full"
											aria-invalid={Boolean(form.formState.errors.teamId) || undefined}
										>
											<SelectValue placeholder="Pick a team" />
										</SelectTrigger>
										<SelectContent>
											{teams.map((t) => (
												<SelectItem key={t.id} value={t.id}>
													{t.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
							/>
							{form.formState.errors.teamId ? (
								<p className="text-destructive text-xs" role="alert">
									{form.formState.errors.teamId.message}
								</p>
							) : (
								<p className="text-muted-foreground text-xs">Manage teams in Settings → Teams.</p>
							)}
						</div>
					) : null}
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={form.formState.isSubmitting}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={form.formState.isSubmitting}>
							{mode === "create" ? `Add ${memberLabel.toLowerCase()}` : "Save changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
