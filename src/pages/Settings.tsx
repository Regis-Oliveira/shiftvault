import { zodResolver } from "@hookform/resolvers/zod";
import {
	DownloadIcon,
	FileSpreadsheetIcon,
	MonitorIcon,
	MoonIcon,
	SunIcon,
	Trash2Icon,
	UploadIcon
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { HolidaysManager } from "@/components/HolidaysManager";
import { PageHeader } from "@/components/PageHeader";
import { TeamsManager } from "@/components/TeamsManager";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useShiftVault } from "@/data/DataProvider";
import { appendAuditEvent, type ExportPayload, exportAll, importAll, wipeAll } from "@/lib/db";
import { newId } from "@/lib/id";
import { downloadBlob, historyToCsv } from "@/lib/report";
import type { ThemeMode } from "@/types";

const workspaceSchema = z.object({
	workspaceName: z
		.string()
		.trim()
		.min(1, "Workspace name is required")
		.max(60, "Workspace name is too long"),
	memberLabel: z
		.string()
		.trim()
		.min(1, "Member label is required")
		.max(30, "Member label is too long"),
	maxBalanceHours: z
		.number({ message: "Required" })
		.int("Whole hours only")
		.min(1, "Cap must be at least 1 hour")
		.max(999, "Cap is too large")
});

type WorkspaceValues = z.infer<typeof workspaceSchema>;

export function SettingsPage() {
	const { members, entries, settings, updateSettings, refresh } = useShiftVault();
	const { mode, setMode } = useTheme();
	const navigate = useNavigate();
	const nameId = useId();
	const labelId = useId();
	const capId = useId();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [pendingImport, setPendingImport] = useState<ExportPayload | null>(null);

	const form = useForm<WorkspaceValues>({
		resolver: zodResolver(workspaceSchema),
		defaultValues: {
			workspaceName: settings.workspaceName,
			memberLabel: settings.memberLabel,
			maxBalanceHours: Math.round(settings.maxBalanceMin / 60)
		}
	});

	useEffect(() => {
		form.reset({
			workspaceName: settings.workspaceName,
			memberLabel: settings.memberLabel,
			maxBalanceHours: Math.round(settings.maxBalanceMin / 60)
		});
	}, [settings, form]);

	async function onSaveWorkspace(values: WorkspaceValues) {
		await updateSettings({
			workspaceName: values.workspaceName,
			memberLabel: values.memberLabel,
			maxBalanceMin: values.maxBalanceHours * 60
		});
		toast.success("Workspace settings saved");
	}

	function handleExportJson() {
		(async () => {
			try {
				const payload = await exportAll();
				const filename = `shiftvault-backup-${todayStamp()}.json`;
				downloadBlob(JSON.stringify(payload, null, 2), filename, "application/json");
				toast.success("Backup exported", { description: filename, duration: 4000 });
			} catch (err) {
				toast.error("Couldn't export backup", {
					description: err instanceof Error ? err.message : "Unknown error"
				});
			}
		})();
	}

	function handleExportCsv() {
		try {
			const csv = historyToCsv(settings.workspaceName, members, entries);
			const filename = `shiftvault-history-${todayStamp()}.csv`;
			downloadBlob(csv, filename, "text/csv;charset=utf-8");
			toast.success("Full history exported", { description: filename, duration: 4000 });
		} catch (err) {
			toast.error("Couldn't export CSV", {
				description: err instanceof Error ? err.message : "Unknown error"
			});
		}
	}

	function handleImportClick() {
		fileInputRef.current?.click();
	}

	function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = ""; // reset so picking the same file again re-fires
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const parsed = JSON.parse(String(reader.result));
				if (
					typeof parsed !== "object" ||
					parsed === null ||
					![1, 2, 3, 4].includes(parsed.schemaVersion) ||
					!Array.isArray(parsed.members) ||
					!Array.isArray(parsed.entries)
				) {
					throw new Error(
						"File doesn't look like a ShiftVault backup (missing schemaVersion / members / entries)."
					);
				}
				setPendingImport(parsed as ExportPayload);
			} catch (err) {
				toast.error("Couldn't read backup file", {
					description: err instanceof Error ? err.message : "Invalid JSON"
				});
			}
		};
		reader.onerror = () => toast.error("Couldn't read the file");
		reader.readAsText(file);
	}

	async function applyImport(strategy: "merge" | "replace") {
		if (!pendingImport) return;
		const payload = pendingImport;
		setPendingImport(null);
		try {
			await importAll(payload, strategy);
			await appendAuditEvent({
				id: newId(),
				timestamp: Date.now(),
				kind: strategy === "replace" ? "import.replace" : "import.merge",
				summary:
					strategy === "replace"
						? `Replaced workspace from backup (${payload.members.length} members, ${payload.entries.length} entries)`
						: `Merged backup into workspace (${payload.members.length} members, ${payload.entries.length} entries)`,
				payload: {
					schemaVersion: payload.schemaVersion,
					memberCount: payload.members.length,
					entryCount: payload.entries.length
				}
			});
			await refresh();
			toast.success(
				strategy === "replace" ? "Workspace replaced from backup" : "Backup merged into workspace",
				{
					description: `${payload.members.length} members, ${payload.entries.length} entries`
				}
			);
		} catch (err) {
			toast.error("Import failed", {
				description: err instanceof Error ? err.message : "Unknown error"
			});
		}
	}

	async function handleWipe() {
		try {
			const memberCount = members.length;
			const entryCount = entries.length;
			await wipeAll();
			// Re-seed the cleared audit log with a record that the wipe happened, so the user can
			// always tell whether the empty workspace came from a fresh install or a hard reset.
			await appendAuditEvent({
				id: newId(),
				timestamp: Date.now(),
				kind: "wipe",
				summary: `Wiped workspace (${memberCount} members, ${entryCount} entries removed)`,
				payload: { memberCount, entryCount }
			});
			await refresh();
			toast.success("Workspace wiped");
			navigate("/");
		} catch (err) {
			toast.error("Couldn't wipe workspace", {
				description: err instanceof Error ? err.message : "Unknown error"
			});
		}
	}

	return (
		<div className="mx-auto max-w-7xl space-y-6">
			<PageHeader
				eyebrow="Workspace"
				title="Settings"
				description="Workspace identity, appearance, and data tools. Everything lives in your browser."
			/>

			<div className="mx-auto w-full max-w-3xl space-y-6">
				<Card className="gap-5 p-6">
					<SectionHeading
						title="Workspace"
						description="Identity used across the app and reports."
					/>
					<form
						onSubmit={form.handleSubmit(onSaveWorkspace)}
						className="flex flex-col gap-5"
						noValidate
					>
						<div className="flex flex-col gap-2">
							<Label htmlFor={nameId}>Workspace name</Label>
							<Input
								id={nameId}
								autoComplete="off"
								aria-invalid={Boolean(form.formState.errors.workspaceName) || undefined}
								{...form.register("workspaceName")}
							/>
							{form.formState.errors.workspaceName ? (
								<p className="text-destructive text-xs" role="alert">
									{form.formState.errors.workspaceName.message}
								</p>
							) : (
								<p className="text-muted-foreground text-xs">
									Shows on the sidebar and at the top of every report.
								</p>
							)}
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor={labelId}>Member label</Label>
							<Input
								id={labelId}
								autoComplete="off"
								placeholder="Member"
								aria-invalid={Boolean(form.formState.errors.memberLabel) || undefined}
								{...form.register("memberLabel")}
							/>
							{form.formState.errors.memberLabel ? (
								<p className="text-destructive text-xs" role="alert">
									{form.formState.errors.memberLabel.message}
								</p>
							) : (
								<p className="text-muted-foreground text-xs">
									What to call team members — e.g. "QA", "Engineer", "Tester". Auto-pluralised.
								</p>
							)}
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor={capId}>Max overtime in bank (hours)</Label>
							<Input
								id={capId}
								type="number"
								inputMode="numeric"
								min={1}
								max={999}
								aria-invalid={Boolean(form.formState.errors.maxBalanceHours) || undefined}
								{...form.register("maxBalanceHours", { valueAsNumber: true })}
							/>
							{form.formState.errors.maxBalanceHours ? (
								<p className="text-destructive text-xs" role="alert">
									{form.formState.errors.maxBalanceHours.message}
								</p>
							) : (
								<p className="text-muted-foreground text-xs">
									Overtime entries are blocked if they would push a member's balance over this.
									Default 48h.
								</p>
							)}
						</div>

						<div className="flex justify-end">
							<Button
								type="submit"
								disabled={form.formState.isSubmitting || !form.formState.isDirty}
							>
								Save changes
							</Button>
						</div>
					</form>
				</Card>

				<Card className="gap-5 p-6">
					<SectionHeading
						title="Teams"
						description="Group members so HR can switch between QA, Engineering, etc. With one team the app stays flat — no tab bar."
					/>
					<TeamsManager />
				</Card>

				<Card className="gap-5 p-6">
					<SectionHeading
						title="Company holidays"
						description="Dates that should be skipped when planning time off across a range."
					/>
					<HolidaysManager />
				</Card>

				<Card className="gap-5 p-6">
					<SectionHeading title="Appearance" description="Theme follows your system by default." />
					<ToggleGroup
						type="single"
						value={mode}
						onValueChange={(next) => {
							if (next === "light" || next === "dark" || next === "system") setMode(next);
						}}
						aria-label="Theme"
						variant="outline"
						className="w-fit"
					>
						<ToggleGroupItem value="light" aria-label="Light theme">
							<SunIcon aria-hidden="true" />
							<span>Light</span>
						</ToggleGroupItem>
						<ToggleGroupItem value="system" aria-label="System theme">
							<MonitorIcon aria-hidden="true" />
							<span>System</span>
						</ToggleGroupItem>
						<ToggleGroupItem value="dark" aria-label="Dark theme">
							<MoonIcon aria-hidden="true" />
							<span>Dark</span>
						</ToggleGroupItem>
					</ToggleGroup>
					<p className="text-muted-foreground text-xs">
						Current resolved theme: <ThemeBadge mode={mode} />
					</p>
				</Card>

				<Card className="gap-5 p-6">
					<SectionHeading
						title="Data"
						description="Browser-only storage means backups are how you move between machines or restore after clearing your cache."
					/>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<DataAction
							icon={<DownloadIcon aria-hidden="true" />}
							title="Export backup (JSON)"
							description="Full workspace — members, entries, and settings. Use this to back up or move to another browser."
							actionLabel="Download backup"
							onClick={handleExportJson}
						/>
						<DataAction
							icon={<FileSpreadsheetIcon aria-hidden="true" />}
							title="Export full history (CSV)"
							description="Flat CSV of every entry across all members. Great for payroll / spreadsheet workflows."
							actionLabel="Download CSV"
							onClick={handleExportCsv}
						/>
					</div>
					<div className="border-border bg-background flex flex-col gap-3 rounded-lg border p-4">
						<div className="flex items-start gap-3">
							<div className="bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
								<UploadIcon aria-hidden="true" className="size-4" />
							</div>
							<div className="flex-1 space-y-1">
								<p className="text-sm font-medium">Import from backup (JSON)</p>
								<p className="text-muted-foreground text-xs">
									Pick a previous export. You'll choose whether to <strong>merge</strong> with
									current data or <strong>replace</strong> everything.
								</p>
							</div>
							<Button variant="outline" size="sm" onClick={handleImportClick}>
								Choose file
							</Button>
							<input
								ref={fileInputRef}
								type="file"
								accept="application/json"
								className="sr-only"
								aria-label="Import workspace backup JSON file"
								onChange={handleImportFile}
							/>
						</div>
					</div>
				</Card>

				<Card className="border-destructive/40 gap-5 p-6">
					<SectionHeading
						title="Danger zone"
						description="Irreversible actions. Export a backup first if you might want this data later."
					/>
					<div className="flex items-center justify-between gap-4">
						<div>
							<p className="text-sm font-medium">Wipe all data</p>
							<p className="text-muted-foreground text-xs">
								Deletes every member, entry, and setting from this browser. Cannot be undone.
							</p>
						</div>
						<ConfirmDialog
							trigger={
								<Button variant="destructive" size="sm">
									<Trash2Icon aria-hidden="true" />
									Wipe everything
								</Button>
							}
							title="Wipe the entire workspace?"
							description={
								<>
									This permanently deletes <strong>{members.length} members</strong>,{" "}
									<strong>{entries.length} entries</strong>, and all settings from this browser.
									This cannot be undone — make sure you've exported a backup if you want this data
									later.
								</>
							}
							confirmLabel="Wipe everything"
							tone="destructive"
							onConfirm={handleWipe}
						/>
					</div>
				</Card>
			</div>

			{pendingImport ? (
				<ImportConfirmDialog
					payload={pendingImport}
					onCancel={() => setPendingImport(null)}
					onApply={applyImport}
				/>
			) : null}
		</div>
	);
}

function SectionHeading({ title, description }: { title: string; description: string }) {
	return (
		<div className="space-y-1">
			<h2 className="text-base font-semibold tracking-tight">{title}</h2>
			<p className="text-muted-foreground text-sm">{description}</p>
		</div>
	);
}

function ThemeBadge({ mode }: { mode: ThemeMode }) {
	const { resolved } = useTheme();
	return (
		<span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider">
			{mode === "system" ? `system (${resolved})` : mode}
		</span>
	);
}

interface DataActionProps {
	icon: React.ReactNode;
	title: string;
	description: string;
	actionLabel: string;
	onClick: () => void;
}

function DataAction({ icon, title, description, actionLabel, onClick }: DataActionProps) {
	return (
		<div className="border-border bg-background flex flex-col gap-3 rounded-lg border p-4">
			<div className="flex items-start gap-3">
				<div className="bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
					{icon}
				</div>
				<div className="flex-1 space-y-1">
					<p className="text-sm font-medium">{title}</p>
					<p className="text-muted-foreground text-xs">{description}</p>
				</div>
			</div>
			<Button variant="outline" size="sm" onClick={onClick}>
				{actionLabel}
			</Button>
		</div>
	);
}

interface ImportConfirmDialogProps {
	payload: ExportPayload;
	onCancel: () => void;
	onApply: (strategy: "merge" | "replace") => Promise<void>;
}

function ImportConfirmDialog({ payload, onCancel, onApply }: ImportConfirmDialogProps) {
	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="import-dialog-title"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
		>
			<Card className="mx-4 max-w-md gap-4 p-6">
				<div className="space-y-1">
					<h2 id="import-dialog-title" className="text-lg font-semibold tracking-tight">
						Import this backup?
					</h2>
					<p className="text-muted-foreground text-sm">
						Found <strong>{payload.members.length}</strong> members and{" "}
						<strong>{payload.entries.length}</strong> entries (schema v{payload.schemaVersion},
						exported {new Date(payload.exportedAt).toLocaleString()}).
					</p>
				</div>
				<ul className="text-muted-foreground space-y-1.5 text-xs">
					<li>
						<strong>Merge</strong> — add the backup's records on top of your current data. Existing
						members and entries with the same IDs are overwritten.
					</li>
					<li>
						<strong>Replace</strong> — wipe everything in this browser first, then import the backup
						as the only data. Irreversible without another backup.
					</li>
				</ul>
				<div className="flex flex-wrap justify-end gap-2">
					<Button variant="ghost" onClick={onCancel}>
						Cancel
					</Button>
					<Button variant="outline" onClick={() => onApply("merge")}>
						Merge
					</Button>
					<Button variant="destructive" onClick={() => onApply("replace")}>
						Replace all
					</Button>
				</div>
			</Card>
		</div>
	);
}

function todayStamp(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}
