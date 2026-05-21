import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { Controller, type Resolver, useFieldArray, useForm } from "react-hook-form";
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
import { getTaskUrls, toIsoDate } from "@/lib/entries";
import { formatMinutes, memberBalance } from "@/lib/hours";
import { newId } from "@/lib/id";
import { TIMEOFF_REASONS, timeoffReasonLabel } from "@/lib/timeoffReason";
import type { Entry, EntryKind, Member, TimeoffReason } from "@/types";

interface FormValues {
	date: string;
	hours: number;
	minutes: number;
	taskUrls?: { value: string }[];
	note?: string;
	timeoffReason?: TimeoffReason;
}

type Mode = "create" | "edit";

interface CreateProps {
	mode?: "create";
	kind: EntryKind;
	member: Member;
	entries: Entry[];
	entry?: never;
	trigger: ReactNode;
}

interface EditProps {
	mode: "edit";
	member: Member;
	entries: Entry[];
	entry: Entry;
	trigger: ReactNode;
	kind?: never;
}

type Props = CreateProps | EditProps;

function todayIso(): string {
	return toIsoDate(new Date());
}

export function EntryFormDialog(props: Props) {
	const mode: Mode = props.mode === "edit" ? "edit" : "create";
	const { member, entries, trigger } = props;
	const kind: EntryKind = props.mode === "edit" ? props.entry.kind : props.kind;
	const editingEntry = props.mode === "edit" ? props.entry : null;

	const [open, setOpen] = useState(false);
	const { addEntry, updateEntry, settings } = useShiftVault();
	const dateId = useId();
	const hoursId = useId();
	const minutesId = useId();
	const urlId = useId();
	const noteId = useId();
	const isOvertime = kind === "overtime";

	// In edit mode, lock date + duration once the entry has settlement bookkeeping.
	const lockSettlementFields = useMemo(() => {
		if (!editingEntry) return false;
		if (editingEntry.kind === "overtime") return (editingEntry.consumedMin ?? 0) > 0;
		return (editingEntry.consumptions?.length ?? 0) > 0;
	}, [editingEntry]);

	const schema = useMemo(() => {
		const baseShape = {
			date: z.string().min(1, "Date is required"),
			hours: z.number({ message: "Required" }).int("Must be a whole number").min(0).max(48),
			minutes: z.number({ message: "Required" }).int("Must be a whole number").min(0).max(59),
			note: z.string().max(280, "Keep notes under 280 characters").optional()
		};
		const built = isOvertime
			? z.object({
					...baseShape,
					taskUrls: z
						.array(z.object({ value: z.url("Must be a valid URL") }))
						.min(1, "At least one task link is required")
				})
			: z.object(baseShape);
		return built.refine((d) => d.hours * 60 + d.minutes > 0, {
			message: "Duration must be greater than zero",
			path: ["hours"]
		});
	}, [isOvertime]);

	const defaults: FormValues = useMemo(() => {
		if (editingEntry) {
			const hours = Math.floor(editingEntry.durationMin / 60);
			const minutes = editingEntry.durationMin % 60;
			const existingUrls = getTaskUrls(editingEntry);
			return {
				date: editingEntry.date,
				hours,
				minutes,
				taskUrls:
					editingEntry.kind === "overtime"
						? (existingUrls.length > 0 ? existingUrls : [""]).map((value) => ({ value }))
						: undefined,
				note: editingEntry.note ?? "",
				timeoffReason:
					editingEntry.kind === "timeoff"
						? (editingEntry.timeoffReason ?? "unspecified")
						: undefined
			};
		}
		return isOvertime
			? { date: todayIso(), hours: 0, minutes: 0, taskUrls: [{ value: "" }], note: "" }
			: {
					date: todayIso(),
					hours: 0,
					minutes: 0,
					note: "",
					timeoffReason: "unspecified" as const
				};
	}, [editingEntry, isOvertime]);

	const form = useForm<FormValues>({
		// Two schemas branch on `kind`; the resolver is correct at runtime but the union
		// trips RHF's resolver generic. Cast through unknown rather than `any`.
		resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
		defaultValues: defaults
	});

	const taskUrlsField = useFieldArray({ control: form.control, name: "taskUrls" });

	useEffect(() => {
		if (open) form.reset(defaults);
	}, [open, defaults, form]);

	const currentBalance = memberBalance(entries);

	async function onSubmit(values: FormValues) {
		const durationMin = values.hours * 60 + values.minutes;

		if (mode === "create") {
			if (isOvertime) {
				const next = currentBalance + durationMin;
				if (next > settings.maxBalanceMin) {
					form.setError("hours", {
						type: "manual",
						message: `Adding ${formatMinutes(durationMin)} would push the balance to ${formatMinutes(next)} — over the ${formatMinutes(settings.maxBalanceMin)} cap. Log some time off first or reduce the duration.`
					});
					return;
				}
			} else if (durationMin > currentBalance) {
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

		const cleanedUrls =
			isOvertime && values.taskUrls
				? values.taskUrls.map((u) => u.value.trim()).filter((v) => v.length > 0)
				: undefined;

		if (mode === "create") {
			const entry: Entry = {
				id: newId(),
				memberId: member.id,
				kind,
				date: values.date,
				durationMin,
				taskUrls: cleanedUrls,
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
			return;
		}

		// edit
		if (!editingEntry) return;
		const updated: Entry = {
			...editingEntry,
			date: values.date,
			durationMin,
			taskUrls: cleanedUrls,
			note: values.note?.trim() || undefined,
			timeoffReason: isOvertime ? undefined : (values.timeoffReason ?? "unspecified")
		};
		try {
			await updateEntry(updated);
			setOpen(false);
		} catch (err) {
			form.setError("hours", {
				type: "manual",
				message: err instanceof Error ? err.message : "Could not save this entry."
			});
		}
	}

	const title =
		mode === "edit"
			? `Edit ${isOvertime ? "overtime" : "time off"} · ${member.name}`
			: `${isOvertime ? "Log overtime" : "Log time off"} · ${member.name}`;
	const description =
		mode === "edit"
			? lockSettlementFields
				? "This entry has settlement history — date and duration are locked. You can still update task links, note, or reason."
				: "Adjust this entry and save."
			: isOvertime
				? "Add overtime worked. A task link is required and the 48h cap is enforced."
				: "Pay out time off from the banked overtime. Oldest entries are settled first.";

	const submitLabel =
		mode === "edit" ? "Save changes" : isOvertime ? "Log overtime" : "Log time off";

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
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
									disabled={lockSettlementFields}
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
									disabled={lockSettlementFields}
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
									disabled={lockSettlementFields}
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
							<div className="flex items-center justify-between">
								<Label htmlFor={`${urlId}-0`}>Task links</Label>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="text-muted-foreground h-7 px-2"
									onClick={() => taskUrlsField.append({ value: "" })}
								>
									<PlusIcon aria-hidden="true" className="size-3.5" />
									Add link
								</Button>
							</div>
							<ul className="flex flex-col gap-2">
								{taskUrlsField.fields.map((field, index) => {
									const fieldErr = form.formState.errors.taskUrls?.[index]?.value;
									return (
										<li key={field.id} className="flex items-start gap-2">
											<Input
												id={index === 0 ? `${urlId}-0` : undefined}
												type="url"
												inputMode="url"
												autoComplete="off"
												placeholder="https://yourcompany.atlassian.net/browse/PROJ-1234"
												aria-invalid={Boolean(fieldErr) || undefined}
												aria-label={`Task link ${index + 1}`}
												{...form.register(`taskUrls.${index}.value` as const)}
											/>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												aria-label={`Remove link ${index + 1}`}
												className="text-muted-foreground hover:text-destructive size-9 shrink-0"
												disabled={taskUrlsField.fields.length === 1}
												onClick={() => taskUrlsField.remove(index)}
											>
												<XIcon className="size-4" />
											</Button>
										</li>
									);
								})}
							</ul>
							{form.formState.errors.taskUrls ? (
								<p className="text-destructive text-xs" role="alert">
									{form.formState.errors.taskUrls.message ??
										form.formState.errors.taskUrls.root?.message ??
										"Fix the invalid link(s) above."}
								</p>
							) : (
								<p className="text-muted-foreground text-xs">
									Add one row per task. Jira, Linear, GitHub, etc.
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
							{submitLabel}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
