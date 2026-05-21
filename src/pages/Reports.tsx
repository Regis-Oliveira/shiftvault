import { format } from "date-fns";
import {
	DownloadIcon,
	ExternalLinkIcon,
	FileSpreadsheetIcon,
	PrinterIcon,
	SearchIcon,
	UsersRoundIcon
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { EmptyStateCard } from "@/components/EmptyStateCard";
import { MonthPicker } from "@/components/MonthPicker";
import { PageHeader } from "@/components/PageHeader";
import { ReasonBadge } from "@/components/ReasonBadge";
import { TeamTabs } from "@/components/TeamTabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select";
import { ALL_TEAMS, useShiftVault, useVisibleMembers } from "@/data/DataProvider";
import { initialsFromName } from "@/lib/avatar";
import { DATE_FULL } from "@/lib/dateFormat";
import { getTaskUrls } from "@/lib/entries";
import { formatMinutes } from "@/lib/hours";
import type { MemberReport, ReportPayload } from "@/lib/report";
import {
	buildReport,
	downloadBlob,
	formatMonthString,
	isValidMonthString,
	localDateFromIso,
	reportFilenameSlug,
	toCsv
} from "@/lib/report";
import { matchMembers } from "@/lib/searchMembers";
import { TIMEOFF_REASONS, timeoffReasonLabel } from "@/lib/timeoffReason";
import { cn } from "@/lib/utils";
import type { Entry, TimeoffReason } from "@/types";

export function ReportsPage() {
	const { entries, settings, isLoading, teams, activeTeamId } = useShiftVault();
	const members = useVisibleMembers();
	const currentMonth = formatMonthString(new Date());
	const [fromMonth, setFromMonth] = useState<string>(currentMonth);
	const [toMonth, setToMonth] = useState<string>(currentMonth);
	const [reasonFilter, setReasonFilter] = useState<TimeoffReason | "all">("all");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [memberSearch, setMemberSearch] = useState("");
	const fromInputId = useId();
	const toInputId = useId();
	const reasonId = useId();

	useEffect(() => {
		// Default: select all current members when the page loads or member list changes.
		setSelectedIds((prev) => {
			if (prev.size > 0) {
				const live = new Set(members.map((m) => m.id));
				const next = new Set<string>();
				for (const id of prev) if (live.has(id)) next.add(id);
				return next;
			}
			return new Set(members.map((m) => m.id));
		});
	}, [members]);

	const fromValid = isValidMonthString(fromMonth);
	const toValid = isValidMonthString(toMonth);
	const monthsValid = fromValid && toValid;
	const reversed = monthsValid && fromMonth > toMonth;

	const activeTeam = activeTeamId === ALL_TEAMS ? null : teams.find((t) => t.id === activeTeamId);
	const displayLabel = activeTeam ? activeTeam.name : "All teams";

	const report = useMemo<ReportPayload | null>(() => {
		if (!monthsValid) return null;
		return buildReport(fromMonth, toMonth, Array.from(selectedIds), members, entries, settings, {
			memberLabel: displayLabel,
			...(reasonFilter === "all" ? {} : { timeoffReason: reasonFilter })
		});
	}, [
		monthsValid,
		fromMonth,
		toMonth,
		selectedIds,
		members,
		entries,
		settings,
		reasonFilter,
		displayLabel
	]);

	if (isLoading) {
		return <p className="text-muted-foreground text-sm">Loading…</p>;
	}

	if (members.length === 0) {
		return (
			<div className="mx-auto max-w-7xl space-y-6">
				<PageHeader
					eyebrow="Monthly report"
					title="Reports"
					description="Build a report across one or more months for selected members and export as JSON, CSV, or print."
				/>
				<EmptyStateCard
					icon={UsersRoundIcon}
					title="No members yet"
					description="Add a member from the dashboard to start building reports."
					action={
						<Button asChild>
							<Link to="/">Go to Dashboard</Link>
						</Button>
					}
				/>
			</div>
		);
	}

	function toggleMember(id: string, checked: boolean) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	}

	// Search filters the checklist view; bulk select-all and the counts follow the same scope so
	// the action matches what the user actually sees. Selections OUTSIDE the search are preserved.
	const visibleMembers = matchMembers(memberSearch, members);
	const visibleIds = visibleMembers.map((m) => m.id);
	const visibleSelectedCount = visibleIds.filter((id) => selectedIds.has(id)).length;

	function toggleAllVisible(checked: boolean) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (checked) for (const id of visibleIds) next.add(id);
			else for (const id of visibleIds) next.delete(id);
			return next;
		});
	}

	const allVisibleChecked =
		visibleMembers.length > 0 && visibleSelectedCount === visibleMembers.length;
	const noneVisibleChecked = visibleSelectedCount === 0;
	const selectAllState: boolean | "indeterminate" = allVisibleChecked
		? true
		: noneVisibleChecked
			? false
			: "indeterminate";

	const canExport = Boolean(report) && selectedIds.size > 0;

	function handleSaveJson() {
		if (!report) return;
		const filename = `shiftvault-report-${reportFilenameSlug(report)}.json`;
		try {
			downloadBlob(JSON.stringify(report, null, 2), filename, "application/json");
			toast.success("Report exported as JSON", {
				description: filename,
				duration: 4000
			});
		} catch (err) {
			toast.error("Couldn't save the JSON file", {
				description: err instanceof Error ? err.message : "Unknown error"
			});
		}
	}

	function handleSaveCsv() {
		if (!report) return;
		const filename = `shiftvault-report-${reportFilenameSlug(report)}.csv`;
		try {
			downloadBlob(toCsv(report), filename, "text/csv;charset=utf-8");
			toast.success("Report exported as CSV", {
				description: filename,
				duration: 4000
			});
		} catch (err) {
			toast.error("Couldn't save the CSV file", {
				description: err instanceof Error ? err.message : "Unknown error"
			});
		}
	}

	function handlePrint() {
		toast.info("Opening the print dialog…", { duration: 2000 });
		window.print();
	}

	return (
		<div className="mx-auto max-w-7xl space-y-6 print:max-w-none print:space-y-4">
			<div className="print:hidden">
				<TeamTabs />
			</div>
			<div className="print:hidden">
				<PageHeader
					eyebrow="Monthly report"
					title="Reports"
					description="Pick a period and members. The preview below is what gets printed or exported."
					actions={
						<div className="flex flex-wrap items-center gap-2">
							<Button variant="outline" onClick={handleSaveJson} disabled={!canExport}>
								<DownloadIcon aria-hidden="true" />
								Save JSON
							</Button>
							<Button variant="outline" onClick={handleSaveCsv} disabled={!canExport}>
								<FileSpreadsheetIcon aria-hidden="true" />
								Save CSV
							</Button>
							<Button onClick={handlePrint} disabled={!canExport}>
								<PrinterIcon aria-hidden="true" />
								Print
							</Button>
						</div>
					}
				/>
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr] print:block">
				<Card className="gap-5 p-5 print:hidden">
					<div className="flex flex-col gap-3">
						<span className="text-sm font-medium">Period</span>
						<div className="grid grid-cols-2 gap-2">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={fromInputId} className="text-muted-foreground text-xs">
									From
								</Label>
								<MonthPicker
									id={fromInputId}
									value={fromMonth}
									onChange={setFromMonth}
									ariaLabel="From month"
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={toInputId} className="text-muted-foreground text-xs">
									To
								</Label>
								<MonthPicker
									id={toInputId}
									value={toMonth}
									onChange={setToMonth}
									ariaLabel="To month"
								/>
							</div>
						</div>
						{!monthsValid ? (
							<p className="text-destructive text-xs" role="alert">
								Pick both a start and end month.
							</p>
						) : reversed ? (
							<p className="text-warning-foreground text-xs">
								<span className="font-medium">Note:</span> end is before start — they will be
								swapped automatically.
							</p>
						) : (
							<p className="text-muted-foreground text-xs">
								Inclusive range. Pick the same month for both to report a single month.
							</p>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor={reasonId} className="text-sm font-medium">
							Time-off reason
						</Label>
						<Select
							value={reasonFilter}
							onValueChange={(v) => setReasonFilter(v as TimeoffReason | "all")}
						>
							<SelectTrigger id={reasonId} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All reasons</SelectItem>
								{TIMEOFF_REASONS.map((r) => (
									<SelectItem key={r} value={r}>
										{timeoffReasonLabel(r)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-xs">
							Narrows time-off in the report; overtime is always included.
						</p>
					</div>

					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<span className="text-sm font-medium">
								{displayLabel} ({visibleSelectedCount}/{visibleMembers.length})
							</span>
							<button
								type="button"
								onClick={() => toggleAllVisible(!allVisibleChecked)}
								disabled={visibleMembers.length === 0}
								className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
							>
								{allVisibleChecked ? "Deselect all" : "Select all"}
							</button>
						</div>
						<div className="relative">
							<SearchIcon
								aria-hidden="true"
								className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2"
							/>
							<Input
								type="search"
								value={memberSearch}
								onChange={(e) => setMemberSearch(e.target.value)}
								placeholder="Search by name or email"
								className="h-9 pl-8 text-sm"
								aria-label="Search members"
							/>
						</div>
						<div className="border-border bg-background flex flex-col gap-1 rounded-md border p-2">
							<MemberCheckboxRow
								label={`Select all (${visibleMembers.length})`}
								state={selectAllState}
								onCheckedChange={(checked) => toggleAllVisible(checked === true)}
								isHeader
							/>
							<div className="bg-border my-1 h-px" />
							{visibleMembers.length === 0 ? (
								<p className="text-muted-foreground px-2 py-2 text-xs">
									No members match "{memberSearch}".
								</p>
							) : (
								visibleMembers.map((m) => (
									<MemberCheckboxRow
										key={m.id}
										label={m.name}
										avatarBase64={m.avatarBase64}
										state={selectedIds.has(m.id)}
										onCheckedChange={(checked) => toggleMember(m.id, checked === true)}
									/>
								))
							)}
						</div>
					</div>
				</Card>

				{report ? (
					<ReportPreview report={report} />
				) : (
					<Card className="text-muted-foreground p-8 text-sm">
						Pick a valid month range to build a report.
					</Card>
				)}
			</div>
		</div>
	);
}

interface MemberCheckboxRowProps {
	label: string;
	avatarBase64?: string;
	state: boolean | "indeterminate";
	onCheckedChange: (checked: boolean | "indeterminate") => void;
	isHeader?: boolean;
}

function MemberCheckboxRow({
	label,
	avatarBase64,
	state,
	onCheckedChange,
	isHeader = false
}: MemberCheckboxRowProps) {
	const id = useId();
	return (
		<label
			htmlFor={id}
			className={cn(
				"hover:bg-accent flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors",
				isHeader && "text-muted-foreground text-xs font-medium uppercase tracking-wider"
			)}
		>
			<Checkbox id={id} checked={state} onCheckedChange={onCheckedChange} />
			{!isHeader && avatarBase64 !== undefined ? (
				<Avatar className="size-6">
					{avatarBase64 ? <AvatarImage src={avatarBase64} alt="" /> : null}
					<AvatarFallback className="text-[10px]">{initialsFromName(label)}</AvatarFallback>
				</Avatar>
			) : null}
			<span className={cn("text-sm", isHeader && "text-xs uppercase")}>{label}</span>
		</label>
	);
}

function ReportPreview({ report }: { report: ReportPayload }) {
	const generatedLabel = format(new Date(report.generatedAt), "PPpp");
	return (
		<Card
			id="report-preview"
			className="gap-6 p-8 print:rounded-none print:border-none print:p-0 print:shadow-none"
		>
			<header className="space-y-2">
				<p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
					{report.workspaceName}
				</p>
				<h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hours Bank Report</h2>
				<p className="text-muted-foreground text-sm">
					Period: <span className="text-foreground font-medium">{report.period.label}</span> ·
					Generated {generatedLabel}
				</p>
			</header>

			<section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<SummaryStat label={report.memberLabel} value={String(report.totals.memberCount)} />
				<SummaryStat label="Entries" value={String(report.totals.entryCount)} />
				<SummaryStat label="Overtime" value={formatMinutes(report.totals.overtimeMin)} />
				<SummaryStat label="Time off" value={formatMinutes(report.totals.timeoffMin)} />
			</section>

			<div className="bg-border h-px" />

			{report.members.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No members selected. Tick at least one to build a report.
				</p>
			) : (
				<div className="flex flex-col gap-6">
					{report.members.map((memberReport) => (
						<MemberSection key={memberReport.memberId} memberReport={memberReport} />
					))}
				</div>
			)}
		</Card>
	);
}

function SummaryStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-border bg-background flex flex-col gap-1 rounded-md border p-3 print:border-0 print:bg-transparent print:p-0">
			<span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
				{label}
			</span>
			<span className="font-mono text-lg font-semibold tracking-tight tabular-nums">{value}</span>
		</div>
	);
}

function MemberSection({ memberReport }: { memberReport: MemberReport }) {
	const overtimeEntries = memberReport.entries.filter((e) => e.kind === "overtime");
	const timeoffEntries = memberReport.entries.filter((e) => e.kind === "timeoff");
	const balanceVariant: "success" | "warning" | "secondary" =
		memberReport.balanceMin > 0 ? "success" : memberReport.balanceMin < 0 ? "warning" : "secondary";

	return (
		<section className="border-border bg-background space-y-3 break-inside-avoid rounded-lg border p-4 print:border-0 print:bg-transparent print:p-0">
			<header className="flex items-center justify-between gap-3 border-b pb-2">
				<h3 className="text-base font-semibold">{memberReport.name}</h3>
				<div className="flex flex-wrap items-center gap-1.5 text-xs">
					<Badge variant={balanceVariant} className="font-mono">
						Balance {formatMinutes(memberReport.balanceMin)}
					</Badge>
					<Badge variant="success" className="font-mono">
						OT {formatMinutes(memberReport.overtimeMin)}
					</Badge>
					<Badge variant="warning" className="font-mono">
						TO {formatMinutes(memberReport.timeoffMin)}
					</Badge>
				</div>
			</header>

			{memberReport.entries.length === 0 ? (
				<p className="text-muted-foreground text-sm">No entries in this period.</p>
			) : (
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<EntryColumn title="Overtime worked" tone="success" entries={overtimeEntries} />
					<EntryColumn title="Time off taken" tone="warning" entries={timeoffEntries} />
				</div>
			)}
		</section>
	);
}

function EntryColumn({
	title,
	tone,
	entries
}: {
	title: string;
	tone: "success" | "warning";
	entries: Entry[];
}) {
	return (
		<div className="space-y-2">
			<h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
				{title}
			</h4>
			{entries.length === 0 ? (
				<p className="text-muted-foreground text-xs">No entries.</p>
			) : (
				<ul className="flex flex-col gap-1.5">
					{entries.map((entry) => (
						<li
							key={entry.id}
							className="border-border flex flex-col gap-1 rounded-md border px-3 py-2 text-sm"
						>
							<div className="flex items-center justify-between gap-2">
								<div className="flex items-center gap-2">
									<span className="font-medium">
										{format(localDateFromIso(entry.date), DATE_FULL)}
									</span>
									{entry.kind === "timeoff" ? <ReasonBadge reason={entry.timeoffReason} /> : null}
								</div>
								<Badge variant={tone} className="font-mono text-[11px]">
									{formatMinutes(entry.durationMin)}
								</Badge>
							</div>
							{(() => {
								const urls = getTaskUrls(entry);
								if (urls.length === 0) return null;
								return (
									<ul className="flex flex-col gap-1">
										{urls.map((url, idx) => (
											<li key={`${url}-${idx}`}>
												<a
													href={url}
													target="_blank"
													rel="noreferrer noopener"
													className="text-muted-foreground hover:text-foreground inline-flex max-w-full items-center gap-1 text-xs underline-offset-2 hover:underline print:no-underline"
												>
													<ExternalLinkIcon
														aria-hidden="true"
														className="size-3 shrink-0 print:hidden"
													/>
													<span className="truncate">{url}</span>
												</a>
											</li>
										))}
									</ul>
								);
							})()}
							{entry.note ? <p className="text-muted-foreground text-xs">{entry.note}</p> : null}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
