import { format } from "date-fns";
import {
	AlertTriangleIcon,
	ArrowLeftCircleIcon,
	CheckCircle2Icon,
	GitMergeIcon,
	MinusIcon,
	PlusIcon,
	UploadCloudIcon,
	UserXIcon
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyStateCard } from "@/components/EmptyStateCard";
import { PageHeader } from "@/components/PageHeader";
import { ReasonBadge } from "@/components/ReasonBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useShiftVault } from "@/data/DataProvider";
import { initialsFromName } from "@/lib/avatar";
import { DATE_FULL } from "@/lib/dateFormat";
import type { ExportPayload } from "@/lib/db";
import { formatMinutes } from "@/lib/hours";
import {
	buildReconciliation,
	defaultReconcileSelection,
	type EntryDiff,
	type ReconciliationResult
} from "@/lib/reconcile";
import { cn } from "@/lib/utils";
import type { Entry } from "@/types";

export function ReconcilePage() {
	const { members, entries, applyReconciliation } = useShiftVault();
	const fileRef = useRef<HTMLInputElement>(null);
	const [payload, setPayload] = useState<ExportPayload | null>(null);
	const [result, setResult] = useState<ReconciliationResult | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [isApplying, setIsApplying] = useState(false);

	function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const parsed = JSON.parse(String(reader.result));
				if (
					typeof parsed !== "object" ||
					parsed === null ||
					(parsed.schemaVersion !== 1 &&
						parsed.schemaVersion !== 2 &&
						parsed.schemaVersion !== 3) ||
					!Array.isArray(parsed.members) ||
					!Array.isArray(parsed.entries)
				) {
					throw new Error("File doesn't look like a ShiftVault backup.");
				}
				const imported = parsed as ExportPayload;
				const diff = buildReconciliation(members, entries, imported.members, imported.entries);
				setPayload(imported);
				setResult(diff);
				setSelected(defaultReconcileSelection(diff));
			} catch (err) {
				toast.error("Couldn't read this file", {
					description: err instanceof Error ? err.message : "Invalid JSON"
				});
			}
		};
		reader.onerror = () => toast.error("Couldn't read the file");
		reader.readAsText(file);
	}

	function toggleEntry(id: string, checked: boolean) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	}

	function toggleAllForMember(diffs: EntryDiff[], checked: boolean) {
		setSelected((prev) => {
			const next = new Set(prev);
			for (const d of diffs) {
				if (checked) next.add(d.imported.id);
				else next.delete(d.imported.id);
			}
			return next;
		});
	}

	function reset() {
		setPayload(null);
		setResult(null);
		setSelected(new Set());
	}

	async function apply() {
		if (!result) return;
		setIsApplying(true);
		try {
			// Re-stamp imported entries with the LOCAL memberId (emails matched, but IDs differ
			// between workspaces). Only entries whose member matched survive — unmatched
			// imported members are explicitly skipped in this version of the flow.
			const localByImportedId = new Map<string, string>();
			for (const m of result.matched) {
				localByImportedId.set(m.imported.id, m.local.id);
			}
			const toApply: Entry[] = [];
			for (const m of result.matched) {
				for (const d of m.entries) {
					if (!selected.has(d.imported.id)) continue;
					const localMemberId = localByImportedId.get(m.imported.id);
					if (!localMemberId) continue;
					toApply.push({ ...d.imported, memberId: localMemberId });
				}
			}
			if (toApply.length === 0) {
				toast.info("Nothing to import", {
					description: "No entries are currently selected."
				});
				setIsApplying(false);
				return;
			}
			const summary = await applyReconciliation(toApply);
			toast.success(
				`Imported ${summary.imported} ${summary.imported === 1 ? "entry" : "entries"}`,
				{
					description:
						summary.settledTimeoffs > 0
							? `${summary.settledTimeoffs} time-off ${summary.settledTimeoffs === 1 ? "entry" : "entries"} settled overtime via FIFO.`
							: undefined,
					duration: 5000
				}
			);
			reset();
		} catch (err) {
			toast.error("Couldn't apply the import", {
				description: err instanceof Error ? err.message : "Unknown error"
			});
		} finally {
			setIsApplying(false);
		}
	}

	if (members.length === 0) {
		return (
			<div className="mx-auto max-w-7xl space-y-6">
				<PageHeader
					eyebrow="Cross-workspace"
					title="Reconcile"
					description="Compare a teammate's backup against your local data and import what's new."
				/>
				<EmptyStateCard
					icon={GitMergeIcon}
					title="Add some members first"
					description="Reconciliation matches members by email, so your workspace needs at least one member before you can compare."
				/>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-7xl space-y-6">
			<PageHeader
				eyebrow="Cross-workspace"
				title="Reconcile"
				description="Drop in a JSON backup from another workspace (e.g. the QA Manager's). We match members by email, surface entries that aren't in your data yet, and let you pick which to import."
			/>

			{!result ? (
				<Card className="gap-4 p-8 text-center">
					<div className="bg-secondary text-secondary-foreground mx-auto flex size-14 items-center justify-center rounded-2xl">
						<UploadCloudIcon aria-hidden="true" className="size-7" />
					</div>
					<div className="space-y-1">
						<p className="text-base font-semibold">Upload a JSON backup</p>
						<p className="text-muted-foreground mx-auto max-w-md text-sm">
							Generated from Settings → "Export backup (JSON)" on the other workspace. Nothing is
							committed yet — you'll review the diff first.
						</p>
					</div>
					<div>
						<Button onClick={() => fileRef.current?.click()}>Choose file</Button>
						<input
							ref={fileRef}
							type="file"
							accept="application/json"
							className="sr-only"
							aria-label="Import workspace export JSON file for reconciliation"
							onChange={handleFile}
						/>
					</div>
				</Card>
			) : (
				<ReviewView
					payload={payload}
					result={result}
					selected={selected}
					onToggleEntry={toggleEntry}
					onToggleMember={toggleAllForMember}
					onReset={reset}
					onApply={apply}
					isApplying={isApplying}
				/>
			)}
		</div>
	);
}

interface ReviewProps {
	payload: ExportPayload | null;
	result: ReconciliationResult;
	selected: Set<string>;
	onToggleEntry: (id: string, checked: boolean) => void;
	onToggleMember: (diffs: EntryDiff[], checked: boolean) => void;
	onReset: () => void;
	onApply: () => Promise<void>;
	isApplying: boolean;
}

function ReviewView({
	payload,
	result,
	selected,
	onToggleEntry,
	onToggleMember,
	onReset,
	onApply,
	isApplying
}: ReviewProps) {
	const selectedCount = result.matched.reduce(
		(sum, m) => sum + m.entries.filter((d) => selected.has(d.imported.id)).length,
		0
	);

	return (
		<>
			<Card className="gap-4 p-5">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-1">
						<p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
							Import summary
						</p>
						<p className="text-sm">
							<strong>{result.totals.matchedMembers}</strong> member
							{result.totals.matchedMembers === 1 ? "" : "s"} matched by email ·{" "}
							<strong>{result.totals.newEntries}</strong> new ·{" "}
							<strong>{result.totals.duplicateEntries}</strong> already in your data ·{" "}
							<strong>{result.totals.conflictEntries}</strong> conflict
							{result.totals.conflictEntries === 1 ? "" : "s"}
						</p>
						{payload ? (
							<p className="text-muted-foreground text-xs">
								Schema v{payload.schemaVersion} · exported{" "}
								{format(new Date(payload.exportedAt), "PPpp")}
							</p>
						) : null}
					</div>
					<div className="flex flex-wrap gap-2">
						<Button variant="ghost" onClick={onReset} disabled={isApplying}>
							<ArrowLeftCircleIcon aria-hidden="true" />
							Choose another file
						</Button>
						<Button onClick={() => void onApply()} disabled={isApplying || selectedCount === 0}>
							{isApplying
								? "Applying…"
								: selectedCount === 0
									? "Pick at least one entry"
									: `Apply ${selectedCount} ${selectedCount === 1 ? "entry" : "entries"}`}
						</Button>
					</div>
				</div>
			</Card>

			{result.unmatched.length > 0 ? (
				<Card className="gap-3 p-5">
					<div className="flex items-start gap-3">
						<div
							aria-hidden="true"
							className="bg-warning-soft text-warning-foreground flex size-8 shrink-0 items-center justify-center rounded-md"
						>
							<UserXIcon className="size-4" />
						</div>
						<div className="space-y-1">
							<p className="text-sm font-medium">
								{result.unmatched.length} imported member
								{result.unmatched.length === 1 ? "" : "s"} have no match in your workspace
							</p>
							<p className="text-muted-foreground text-xs">
								These are skipped automatically. Add a local member with the same email first (in{" "}
								<strong>Dashboard → New member</strong>) and re-upload the file to include their
								entries.
							</p>
						</div>
					</div>
					<ul className="text-muted-foreground space-y-1 text-xs">
						{result.unmatched.map((u) => (
							<li key={u.imported.id} className="flex items-center justify-between gap-2">
								<span>
									<span className="text-foreground font-medium">
										{u.imported.name || "(unnamed)"}
									</span>{" "}
									· {u.imported.email || "no email"}
								</span>
								<span>
									{u.entryCount} {u.entryCount === 1 ? "entry" : "entries"} skipped
								</span>
							</li>
						))}
					</ul>
				</Card>
			) : null}

			{result.matched.length === 0 ? (
				<Card className="p-8 text-center">
					<p className="text-muted-foreground text-sm">
						No matched members. Add local members whose emails match the import, then re-upload.
					</p>
				</Card>
			) : (
				<div className="flex flex-col gap-4">
					{result.matched.map((m) => (
						<MemberDiffCard
							key={m.imported.id}
							diff={m}
							selected={selected}
							onToggleEntry={onToggleEntry}
							onToggleMember={onToggleMember}
						/>
					))}
				</div>
			)}
		</>
	);
}

interface MemberDiffCardProps {
	diff: ReconciliationResult["matched"][number];
	selected: Set<string>;
	onToggleEntry: (id: string, checked: boolean) => void;
	onToggleMember: (diffs: EntryDiff[], checked: boolean) => void;
}

function MemberDiffCard({ diff, selected, onToggleEntry, onToggleMember }: MemberDiffCardProps) {
	const { local, entries, counts } = diff;
	const allChecked = entries.length > 0 && entries.every((d) => selected.has(d.imported.id));
	const noneChecked = entries.every((d) => !selected.has(d.imported.id));
	const selectAllState: boolean | "indeterminate" = allChecked
		? true
		: noneChecked
			? false
			: "indeterminate";
	const selectedHere = entries.filter((d) => selected.has(d.imported.id)).length;

	return (
		<Card className="gap-4 p-5">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-start gap-3">
					<Avatar className="size-11">
						{local.avatarBase64 ? <AvatarImage src={local.avatarBase64} alt="" /> : null}
						<AvatarFallback>{initialsFromName(local.name)}</AvatarFallback>
					</Avatar>
					<div>
						<p className="text-sm font-semibold">{local.name}</p>
						<p className="text-muted-foreground font-mono text-xs">{local.email}</p>
						<div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
							{counts.new > 0 ? <Badge variant="success">{counts.new} new</Badge> : null}
							{counts.duplicate > 0 ? (
								<Badge variant="outline" className="text-muted-foreground">
									{counts.duplicate} duplicate
								</Badge>
							) : null}
							{counts.conflict > 0 ? (
								<Badge variant="warning">{counts.conflict} conflict</Badge>
							) : null}
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground text-xs">
						{selectedHere}/{entries.length} selected
					</span>
					<button
						type="button"
						onClick={() => onToggleMember(entries, !allChecked)}
						className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
					>
						{allChecked ? "Deselect all" : "Select all"}
					</button>
					<Checkbox
						checked={selectAllState}
						onCheckedChange={(checked) => onToggleMember(entries, checked === true)}
						aria-label={`Toggle all entries for ${local.name}`}
					/>
				</div>
			</div>

			{entries.length === 0 ? (
				<p className="text-muted-foreground text-xs">No entries to import for this member.</p>
			) : (
				<ul className="flex flex-col gap-2">
					{entries.map((d) => (
						<EntryDiffRow
							key={d.imported.id}
							diff={d}
							checked={selected.has(d.imported.id)}
							onToggle={(checked) => onToggleEntry(d.imported.id, checked)}
						/>
					))}
				</ul>
			)}
		</Card>
	);
}

interface EntryDiffRowProps {
	diff: EntryDiff;
	checked: boolean;
	onToggle: (checked: boolean) => void;
}

function EntryDiffRow({ diff, checked, onToggle }: EntryDiffRowProps) {
	const { imported, status, localMatch } = diff;
	const date = new Date(`${imported.date}T00:00:00`);
	const dateLabel = format(date, DATE_FULL);
	const isOvertime = imported.kind === "overtime";
	const Icon = isOvertime ? PlusIcon : MinusIcon;

	return (
		<li
			className={cn(
				"border-border bg-background flex flex-col gap-2 rounded-lg border p-3",
				status === "duplicate" && "opacity-60",
				status === "conflict" && "border-warning/50 bg-warning-soft/30"
			)}
		>
			<div className="flex items-start gap-3">
				<Checkbox
					checked={checked}
					onCheckedChange={(c) => onToggle(c === true)}
					aria-label={`Import entry from ${dateLabel}`}
					className="mt-0.5"
				/>
				<div className="flex flex-1 flex-col gap-1.5">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium">{dateLabel}</span>
							<StatusChip status={status} />
							{imported.kind === "timeoff" ? <ReasonBadge reason={imported.timeoffReason} /> : null}
						</div>
						<Badge variant={isOvertime ? "success" : "warning"} className="font-mono text-[11px]">
							<Icon aria-hidden="true" className="size-3" />
							{formatMinutes(imported.durationMin)}
						</Badge>
					</div>
					{imported.taskUrl ? (
						<p className="text-muted-foreground truncate text-xs">{imported.taskUrl}</p>
					) : null}
					{imported.note ? <p className="text-muted-foreground text-xs">{imported.note}</p> : null}
					{status === "conflict" && localMatch ? (
						<p className="text-warning-foreground inline-flex items-center gap-1 text-[11px]">
							<AlertTriangleIcon aria-hidden="true" className="size-3" />
							You have a different entry on the same day —{" "}
							<span className="font-mono">{formatMinutes(localMatch.durationMin)}</span>. Importing
							will add this one alongside (won't replace it).
						</p>
					) : null}
					{status === "duplicate" && localMatch ? (
						<p className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
							<CheckCircle2Icon aria-hidden="true" className="size-3" />
							Already in your data — skipped by default.
						</p>
					) : null}
				</div>
			</div>
		</li>
	);
}

function StatusChip({ status }: { status: EntryDiff["status"] }) {
	if (status === "new") {
		return (
			<Badge variant="success" className="text-[10px]">
				New
			</Badge>
		);
	}
	if (status === "duplicate") {
		return (
			<Badge variant="outline" className="text-muted-foreground text-[10px]">
				Duplicate
			</Badge>
		);
	}
	return (
		<Badge variant="warning" className="text-[10px]">
			Conflict
		</Badge>
	);
}
