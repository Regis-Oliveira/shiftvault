import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { Controller, type Resolver, useForm } from "react-hook-form";
import { z } from "zod";

import { DayPicker } from "@/components/DayPicker";
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
import { toIsoDate } from "@/lib/entries";
import { formatMinutes, memberBalance } from "@/lib/hours";
import { newId } from "@/lib/id";
import { TIMEOFF_REASONS, timeoffReasonLabel } from "@/lib/timeoffReason";
import type { Entry, EntryKind, Member, TimeoffReason } from "@/types";

interface FormValues {
	date: string;
	hours: number;
	minutes: number;
	taskUrl?: string;
	note?: string;
	timeoffReason?: TimeoffReason;
}

interface Props {
	kind: EntryKind;
	member: Member;
	entries: Entry[];
	trigger: ReactNode;
}

function todayIso(): string {
	return toIsoDate(new Date());
}

export function EntryFormDialog({ kind, member, entries, trigger }: Props) {
	const [open, setOpen] = useState(false);
	const { addEntry, settings } = useShiftVault();
	const dateId = useId();
	const hoursId = useId();
	const minutesId = useId();
	const urlId = useId();
	const noteId = useId();
	const isOvertime = kind === "overtime";

	const schema = useMemo(() => {
		const baseShape = {
			date: z.string().min(1, "Date is required"),
			hours: z.number({ message: "Required" }).int("Must be a whole number").min(0).max(48),
			minutes: z.number({ message: "Required" }).int("Must be a whole number").min(0).max(59),
			note: z.string().max(280, "Keep notes under 280 characters").optional()
		};
		const built = isOvertime
			? z.object({ ...baseShape, taskUrl: z.url("Must be a valid URL") })
			: z.object(baseShape);
		return built.refine((d) => d.hours * 60 + d.minutes > 0, {
			message: "Duration must be greater than zero",
			path: ["hours"]
		});
	}, [isOvertime]);

	const defaults: FormValues = useMemo(
		() =>
			isOvertime
				? { date: todayIso(), hours: 0, minutes: 0, taskUrl: "", note: "" }
				: {
						date: todayIso(),
						hours: 0,
						minutes: 0,
						note: "",
						timeoffReason: "unspecified" as const
					},
		[isOvertime]
	);

	const form = useForm<FormValues>({
		// Two schemas branch on `kind`; the resolver is correct at runtime but the union
		// trips RHF's resolver generic. Cast through unknown rather than `any`.
		resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
		defaultValues: defaults
	});

	useEffect(() => {
		if (open) form.reset(defaults);
	}, [open, defaults, form]);

	const currentBalance = memberBalance(entries);

	async function onSubmit(values: FormValues) {
		const durationMin = values.hours * 60 + values.minutes;

		if (isOvertime) {
			const next = currentBalance + durationMin;
			if (next > settings.maxBalanceMin) {
				form.setError("hours", {
					type: "manual",
					message: `Adding ${formatMinutes(durationMin)} would push the balance to ${formatMinutes(next)} — over the ${formatMinutes(settings.maxBalanceMin)} cap. Log some time off first or reduce the duration.`
				});
				return;
			}
		} else {
			// Time-off can't pull more hours than the member has banked.
			if (durationMin > currentBalance) {
				form.setError("hours", {
					type: "manual",
					message:
						currentBalance <= 0
							? `${member.name} has no banked overtime to pay out. Log overtime first.`
							: `Only ${formatMinutes(currentBalance)} is available in the bank — reduce the duration.`
				});
				return;
			}
		}

		const entry: Entry = {
			id: newId(),
			memberId: member.id,
			kind,
			date: values.date,
			durationMin,
			taskUrl: isOvertime ? values.taskUrl?.trim() : undefined,
			note: values.note?.trim() || undefined,
			timeoffReason: isOvertime ? undefined : (values.timeoffReason ?? "unspecified"),
			createdAt: Date.now()
		};
		try {
			await addEntry(entry);
			setOpen(false);
		} catch (err) {
			form.setError("hours", {
				type: "manual",
				message: err instanceof Error ? err.message : "Could not save this entry."
			});
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{isOvertime ? "Log overtime" : "Log time off"} · {member.name}
					</DialogTitle>
					<DialogDescription>
						{isOvertime
							? "Add overtime worked. A task link is required and the 48h cap is enforced."
							: "Pay out time off from the banked overtime. Oldest entries are settled first."}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
					<div className="flex flex-col gap-2">
						<Label htmlFor={dateId}>Date</Label>
						<Controller
							control={form.control}
							name="date"
							render={({ field }) => (
								<DayPicker
									id={dateId}
									value={field.value}
									onChange={field.onChange}
									ariaLabel="Entry date"
									max={todayIso()}
								/>
							)}
						/>
						{form.formState.errors.date ? (
							<p className="text-destructive text-xs" role="alert">
								{form.formState.errors.date.message}
							</p>
						) : null}
					</div>

					<div className="flex flex-col gap-2">
						<span className="text-sm font-medium">Duration</span>
						<div className="grid grid-cols-2 gap-3">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={hoursId} className="text-muted-foreground text-xs">
									Hours
								</Label>
								<Input
									id={hoursId}
									type="number"
									inputMode="numeric"
									min={0}
									max={48}
									aria-invalid={Boolean(form.formState.errors.hours) || undefined}
									{...form.register("hours", { valueAsNumber: true })}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={minutesId} className="text-muted-foreground text-xs">
									Minutes
								</Label>
								<Input
									id={minutesId}
									type="number"
									inputMode="numeric"
									min={0}
									max={59}
									step={5}
									aria-invalid={Boolean(form.formState.errors.minutes) || undefined}
									{...form.register("minutes", { valueAsNumber: true })}
								/>
							</div>
						</div>
						{form.formState.errors.hours ? (
							<p className="text-destructive text-xs" role="alert">
								{form.formState.errors.hours.message}
							</p>
						) : form.formState.errors.minutes ? (
							<p className="text-destructive text-xs" role="alert">
								{form.formState.errors.minutes.message}
							</p>
						) : (
							<p className="text-muted-foreground text-xs">
								Current balance: <span className="font-mono">{formatMinutes(currentBalance)}</span>
								{isOvertime ? ` · cap ${formatMinutes(settings.maxBalanceMin)}` : ""}
							</p>
						)}
					</div>

					{isOvertime ? (
						<div className="flex flex-col gap-2">
							<Label htmlFor={urlId}>Task link</Label>
							<Input
								id={urlId}
								type="url"
								inputMode="url"
								autoComplete="off"
								placeholder="https://yourcompany.atlassian.net/browse/PROJ-1234"
								aria-invalid={Boolean(form.formState.errors.taskUrl) || undefined}
								{...form.register("taskUrl")}
							/>
							{form.formState.errors.taskUrl ? (
								<p className="text-destructive text-xs" role="alert">
									{form.formState.errors.taskUrl.message}
								</p>
							) : (
								<p className="text-muted-foreground text-xs">
									Any URL — Jira, Linear, GitHub, etc.
								</p>
							)}
						</div>
					) : (
						<div className="flex flex-col gap-2">
							<Label htmlFor={`${urlId}-reason`}>Reason</Label>
							<Controller
								control={form.control}
								name="timeoffReason"
								render={({ field }) => (
									<Select
										value={field.value ?? "unspecified"}
										onValueChange={(v) => field.onChange(v as TimeoffReason)}
									>
										<SelectTrigger id={`${urlId}-reason`} className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{TIMEOFF_REASONS.map((r) => (
												<SelectItem key={r} value={r}>
													{timeoffReasonLabel(r)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
							/>
							<p className="text-muted-foreground text-xs">
								Helps HR group time off by category. Leave as Unspecified if unsure.
							</p>
						</div>
					)}

					<div className="flex flex-col gap-2">
						<Label htmlFor={noteId}>
							Note <span className="text-muted-foreground text-xs font-normal">(optional)</span>
						</Label>
						<Input
							id={noteId}
							type="text"
							autoComplete="off"
							placeholder={isOvertime ? "e.g. hotfix release" : "e.g. comp day"}
							{...form.register("note")}
						/>
					</div>

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
							{isOvertime ? "Log overtime" : "Log time off"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
