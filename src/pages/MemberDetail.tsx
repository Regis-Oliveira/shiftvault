import { format, parseISO } from "date-fns";
import {
	ArrowLeftIcon,
	CalendarRangeIcon,
	ClockIcon,
	ExternalLinkIcon,
	MailIcon,
	MinusIcon,
	PencilIcon,
	PlusIcon,
	Trash2Icon,
	XIcon
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EntryFormDialog } from "@/components/EntryFormDialog";
import { MemberFormDialog } from "@/components/MemberFormDialog";
import { PlanTimeOffDialog } from "@/components/PlanTimeOffDialog";
import { ReasonBadge } from "@/components/ReasonBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useShiftVault } from "@/data/DataProvider";
import { initialsFromName } from "@/lib/avatar";
import { DATE_FULL, DATE_MEDIUM, DATE_SHORT } from "@/lib/dateFormat";
import { formatMinutes, memberBalance, totalOvertime, totalTimeOff } from "@/lib/hours";
import { availableMin, isSettled, openOvertimeMin, settledOvertimeMin } from "@/lib/settlement";
import { cn } from "@/lib/utils";
import type { Entry, Member } from "@/types";

export function MemberDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { members, settings, isLoading, entriesForMember, removeMember, removeEntry } =
		useShiftVault();
	const [actionError, setActionError] = useState<string | null>(null);

	if (isLoading) {
		return <p className="text-muted-foreground text-sm">Loading…</p>;
	}

	const member = members.find((m) => m.id === id);
	if (!member) return <Navigate to="/" replace />;

	const entries = entriesForMember(member.id);
	const balance = memberBalance(entries);
	const overtimeEntries = entries.filter((e) => e.kind === "overtime");
	const bankedOvertime = overtimeEntries.filter((e) => !isSettled(e));
	const settledOvertime = overtimeEntries.filter((e) => isSettled(e));
	const partiallySettledOvertime = bankedOvertime.filter((e) => (e.consumedMin ?? 0) > 0);
	const timeoffEntries = entries.filter((e) => e.kind === "timeoff");
	const balanceVariant = balance > 0 ? "success" : balance < 0 ? "warning" : "secondary";

	const overtimeById = new Map(overtimeEntries.map((e) => [e.id, e]));
	const timeoffById = new Map(timeoffEntries.map((e) => [e.id, e]));

	async function handleRemoveMember() {
		if (!member) return;
		await removeMember(member.id);
		navigate("/");
	}

	async function handleDeleteEntry(entryId: string) {
		setActionError(null);
		try {
			await removeEntry(entryId);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Could not delete this entry.");
		}
	}

	return (
		<div className="mx-auto max-w-7xl space-y-8">
			<Button asChild variant="ghost" size="sm" className="text-muted-foreground -ml-2">
				<Link to="/">
					<ArrowLeftIcon aria-hidden="true" />
					Back to Dashboard
				</Link>
			</Button>

			{actionError ? (
				<div
					role="alert"
					className="border-destructive/40 bg-destructive/10 text-destructive flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm"
				>
					<span>{actionError}</span>
					<button
						type="button"
						aria-label="Dismiss"
						onClick={() => setActionError(null)}
						className="hover:bg-destructive/20 -m-1 rounded-md p-1"
					>
						<XIcon className="size-4" />
					</button>
				</div>
			) : null}

			<header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex items-start gap-4">
					<Avatar className="size-20">
						{member.avatarBase64 ? <AvatarImage src={member.avatarBase64} alt="" /> : null}
						<AvatarFallback className="text-xl">{initialsFromName(member.name)}</AvatarFallback>
					</Avatar>
					<div className="space-y-2">
						<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{member.name}</h1>
						<p className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
							<MailIcon aria-hidden="true" className="size-3.5" />
							<span className="font-mono text-xs">{member.email}</span>
						</p>
						<p className="text-muted-foreground text-sm">
							{entries.length === 1 ? "1 entry" : `${entries.length} entries`} ·{" "}
							{formatMinutes(totalOvertime(entries))} overtime ·{" "}
							{formatMinutes(totalTimeOff(entries))} time off
						</p>
						<div className="flex flex-wrap gap-2">
							<MemberFormDialog
								mode="edit"
								member={member}
								memberLabel={settings.memberLabel}
								trigger={
									<Button variant="outline" size="sm">
										<PencilIcon aria-hidden="true" />
										Edit profile
									</Button>
								}
							/>
							<ConfirmDialog
								trigger={
									<Button
										variant="ghost"
										size="sm"
										className="text-destructive hover:bg-destructive/10 hover:text-destructive"
									>
										<Trash2Icon aria-hidden="true" />
										Remove
									</Button>
								}
								title={`Remove ${member.name}?`}
								description={
									<>
										This will permanently delete <strong>{member.name}</strong> and all{" "}
										{entries.length} of their entries. This action cannot be undone.
									</>
								}
								confirmLabel="Remove"
								tone="destructive"
								onConfirm={handleRemoveMember}
							/>
						</div>
					</div>
				</div>
				<Card className="min-w-[220px] gap-2 p-5">
					<div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider">
						<ClockIcon aria-hidden="true" className="size-3.5" />
						Open balance
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
							{formatMinutes(balance)}
						</span>
						<Badge variant={balanceVariant} className="text-[11px]">
							cap {formatMinutes(settings.maxBalanceMin)}
						</Badge>
					</div>
					<div className="text-muted-foreground mt-1 flex flex-col gap-0.5 text-[11px]">
						<span>
							In bank:{" "}
							<span className="text-foreground font-mono">
								{formatMinutes(openOvertimeMin(overtimeEntries))}
							</span>
						</span>
						<span>
							Settled all-time:{" "}
							<span className="text-foreground font-mono">
								{formatMinutes(settledOvertimeMin(overtimeEntries))}
							</span>
						</span>
					</div>
				</Card>
			</header>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<OvertimeColumn
					member={member}
					entries={entries}
					banked={bankedOvertime}
					settled={settledOvertime}
					partiallySettled={partiallySettledOvertime}
					timeoffById={timeoffById}
					onDelete={handleDeleteEntry}
				/>
				<TimeoffColumn
					member={member}
					entries={entries}
					list={timeoffEntries}
					overtimeById={overtimeById}
					onDelete={handleDeleteEntry}
				/>
			</div>
		</div>
	);
}

interface OvertimeColumnProps {
	member: Member;
	entries: Entry[];
	banked: Entry[];
	settled: Entry[];
	partiallySettled: Entry[];
	timeoffById: Map<string, Entry>;
	onDelete: (id: string) => Promise<void>;
}

function OvertimeColumn({
	member,
	entries,
	banked,
	settled,
	partiallySettled,
	timeoffById,
	onDelete
}: OvertimeColumnProps) {
	return (
		<Card className="gap-4 p-5">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2">
						<div
							aria-hidden="true"
							className="bg-[var(--color-success-soft)] text-[var(--color-success-foreground)] flex size-7 items-center justify-center rounded-md"
						>
							<PlusIcon className="size-4" />
						</div>
						<h2 className="text-base font-semibold">Overtime worked</h2>
					</div>
					<p className="text-muted-foreground mt-1 text-xs">
						{banked.length === 1 ? "1 banked entry" : `${banked.length} banked entries`}
						{settled.length > 0 ? ` · ${settled.length} settled` : ""}
					</p>
				</div>
				<Badge variant="success" className="font-mono">
					{formatMinutes(totalOvertime(entries))}
				</Badge>
			</div>

			<EntrySection
				heading="Banked"
				headingHint={`${formatMinutes(openOvertimeMin(banked))} available`}
				tone="success"
				entries={banked}
				partiallySettledIds={new Set(partiallySettled.map((e) => e.id))}
				timeoffById={timeoffById}
				onDelete={onDelete}
				emptyLabel="No overtime in the bank."
			/>

			{settled.length > 0 ? (
				<EntrySection
					heading="Settled"
					headingHint={`${formatMinutes(settledOvertimeMin(settled))} paid out`}
					tone="muted"
					entries={settled}
					partiallySettledIds={new Set()}
					timeoffById={timeoffById}
					onDelete={onDelete}
					emptyLabel="No settled overtime."
				/>
			) : null}

			<EntryFormDialog
				member={member}
				entries={entries}
				kind="overtime"
				trigger={
					<Button variant="outline" size="sm">
						<PlusIcon aria-hidden="true" />
						Log overtime
					</Button>
				}
			/>
		</Card>
	);
}

interface TimeoffColumnProps {
	member: Member;
	entries: Entry[];
	list: Entry[];
	overtimeById: Map<string, Entry>;
	onDelete: (id: string) => Promise<void>;
}

function TimeoffColumn({ member, entries, list, overtimeById, onDelete }: TimeoffColumnProps) {
	return (
		<Card className="gap-4 p-5">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2">
						<div
							aria-hidden="true"
							className="bg-[var(--color-warning-soft)] text-[var(--color-warning-foreground)] flex size-7 items-center justify-center rounded-md"
						>
							<MinusIcon className="size-4" />
						</div>
						<h2 className="text-base font-semibold">Time off taken</h2>
					</div>
					<p className="text-muted-foreground mt-1 text-xs">
						{list.length === 1 ? "1 entry" : `${list.length} entries`}
					</p>
				</div>
				<Badge variant="warning" className="font-mono">
					{formatMinutes(totalTimeOff(entries))}
				</Badge>
			</div>

			<ul className="flex flex-col gap-2" aria-label="Time off taken">
				{list.length === 0 ? (
					<li className="text-muted-foreground py-6 text-center text-sm">No time off taken yet.</li>
				) : (
					list.map((entry) => (
						<TimeoffRow
							key={entry.id}
							entry={entry}
							overtimeById={overtimeById}
							onDelete={onDelete}
						/>
					))
				)}
			</ul>

			<div className="flex flex-wrap gap-2">
				<EntryFormDialog
					member={member}
					entries={entries}
					kind="timeoff"
					trigger={
						<Button variant="outline" size="sm">
							<MinusIcon aria-hidden="true" />
							Log time off
						</Button>
					}
				/>
				<PlanTimeOffDialog
					member={member}
					entries={entries}
					trigger={
						<Button variant="outline" size="sm">
							<CalendarRangeIcon aria-hidden="true" />
							Plan time off
						</Button>
					}
				/>
			</div>
		</Card>
	);
}

interface EntrySectionProps {
	heading: string;
	headingHint: string;
	tone: "success" | "muted";
	entries: Entry[];
	partiallySettledIds: Set<string>;
	timeoffById: Map<string, Entry>;
	onDelete: (id: string) => Promise<void>;
	emptyLabel: string;
}

function EntrySection({
	heading,
	headingHint,
	tone,
	entries,
	partiallySettledIds,
	timeoffById,
	onDelete,
	emptyLabel
}: EntrySectionProps) {
	return (
		<div className="flex flex-col gap-2">
			<div className="text-muted-foreground flex items-center justify-between text-[11px] font-medium uppercase tracking-wider">
				<span>{heading}</span>
				<span className="font-mono">{headingHint}</span>
			</div>
			<ul className="flex flex-col gap-2" aria-label={heading}>
				{entries.length === 0 ? (
					<li className="text-muted-foreground py-3 text-center text-xs">{emptyLabel}</li>
				) : (
					entries.map((entry) => (
						<OvertimeRow
							key={entry.id}
							entry={entry}
							tone={tone}
							isPartiallySettled={partiallySettledIds.has(entry.id)}
							timeoffById={timeoffById}
							onDelete={onDelete}
						/>
					))
				)}
			</ul>
		</div>
	);
}

interface OvertimeRowProps {
	entry: Entry;
	tone: "success" | "muted";
	isPartiallySettled: boolean;
	timeoffById: Map<string, Entry>;
	onDelete: (id: string) => Promise<void>;
}

function OvertimeRow({ entry, tone, isPartiallySettled, timeoffById, onDelete }: OvertimeRowProps) {
	const date = parseISO(entry.date);
	const dateLabel = format(date, DATE_FULL);
	const fullySettled = isSettled(entry);
	const available = availableMin(entry);
	const consumed = entry.consumedMin ?? 0;

	// Find which time-off entries consumed this OT (look up by reverse).
	const settledBy: Entry[] = [];
	for (const timeoff of timeoffById.values()) {
		if (timeoff.consumptions?.some((c) => c.overtimeEntryId === entry.id)) {
			settledBy.push(timeoff);
		}
	}

	return (
		<li
			className={cn(
				"border-border flex flex-col gap-2 rounded-lg border p-3",
				tone === "success" ? "bg-background" : "bg-muted/30"
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<span
					className={cn(
						"text-sm font-medium",
						tone === "muted" && "text-muted-foreground line-through decoration-1"
					)}
				>
					{dateLabel}
				</span>
				<div className="flex items-center gap-1.5">
					{isPartiallySettled ? (
						<Badge variant="secondary" className="font-mono text-[10px]">
							{formatMinutes(available)} of {formatMinutes(entry.durationMin)} open
						</Badge>
					) : (
						<Badge
							variant={tone === "success" ? "success" : "secondary"}
							className="font-mono text-[11px]"
						>
							{formatMinutes(entry.durationMin)}
						</Badge>
					)}
					{fullySettled || consumed > 0 ? null : (
						<ConfirmDialog
							trigger={
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={`Delete entry from ${dateLabel}`}
									className="text-muted-foreground hover:text-destructive size-7"
								>
									<Trash2Icon className="size-3.5" />
								</Button>
							}
							title="Delete this entry?"
							description={
								<>
									This will permanently remove the {formatMinutes(entry.durationMin)} entry from{" "}
									{dateLabel}. This action cannot be undone.
								</>
							}
							confirmLabel="Delete"
							tone="destructive"
							onConfirm={() => onDelete(entry.id)}
						/>
					)}
				</div>
			</div>
			{entry.taskUrl ? (
				<a
					href={entry.taskUrl}
					target="_blank"
					rel="noreferrer noopener"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 truncate text-xs underline-offset-2 hover:underline"
				>
					<ExternalLinkIcon aria-hidden="true" className="size-3 shrink-0" />
					<span className="truncate">{entry.taskUrl}</span>
				</a>
			) : null}
			{entry.note ? <p className="text-muted-foreground text-xs">{entry.note}</p> : null}
			{settledBy.length > 0 ? (
				<p className="text-muted-foreground text-[11px]">
					{fullySettled ? "Settled" : "Partly settled"} by{" "}
					{settledBy.map((t) => format(parseISO(t.date), DATE_MEDIUM)).join(", ")} time off.
				</p>
			) : null}
		</li>
	);
}

interface TimeoffRowProps {
	entry: Entry;
	overtimeById: Map<string, Entry>;
	onDelete: (id: string) => Promise<void>;
}

function TimeoffRow({ entry, overtimeById, onDelete }: TimeoffRowProps) {
	const date = parseISO(entry.date);
	const dateLabel = format(date, DATE_FULL);
	const consumptions = entry.consumptions ?? [];

	return (
		<li className="border-border bg-background flex flex-col gap-2 rounded-lg border p-3">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">{dateLabel}</span>
					<ReasonBadge reason={entry.timeoffReason} />
				</div>
				<div className="flex items-center gap-1.5">
					<Badge variant="warning" className="font-mono text-[11px]">
						{formatMinutes(entry.durationMin)}
					</Badge>
					<ConfirmDialog
						trigger={
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={`Delete entry from ${dateLabel}`}
								className="text-muted-foreground hover:text-destructive size-7"
							>
								<Trash2Icon className="size-3.5" />
							</Button>
						}
						title="Delete this entry?"
						description={
							<>
								This will permanently remove the {formatMinutes(entry.durationMin)} entry from{" "}
								{dateLabel}. The overtime hours it consumed will be restored to the bank.
							</>
						}
						confirmLabel="Delete"
						tone="destructive"
						onConfirm={() => onDelete(entry.id)}
					/>
				</div>
			</div>
			{entry.note ? <p className="text-muted-foreground text-xs">{entry.note}</p> : null}
			{consumptions.length > 0 ? (
				<p className="text-muted-foreground text-[11px]">
					Paid from{" "}
					{consumptions
						.map((c) => {
							const ot = overtimeById.get(c.overtimeEntryId);
							return ot ? format(parseISO(ot.date), DATE_SHORT) : "?";
						})
						.join(", ")}{" "}
					overtime.
				</p>
			) : null}
		</li>
	);
}
