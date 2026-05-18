import {
	CalendarDaysIcon,
	FileTextIcon,
	GitMergeIcon,
	LayoutDashboardIcon,
	SettingsIcon
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { ThemeToggle } from "@/components/ThemeToggle";
import { useShiftVault } from "@/data/DataProvider";
import { cn } from "@/lib/utils";

interface NavItem {
	to: string;
	label: string;
	icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV: NavItem[] = [
	{ to: "/", label: "Dashboard", icon: LayoutDashboardIcon },
	{ to: "/calendar", label: "Calendar", icon: CalendarDaysIcon },
	{ to: "/reports", label: "Reports", icon: FileTextIcon },
	{ to: "/reconcile", label: "Reconcile", icon: GitMergeIcon },
	{ to: "/settings", label: "Settings", icon: SettingsIcon }
];

export function AppShell() {
	return (
		<div className="bg-background text-foreground flex h-screen justify-center overflow-hidden">
			<div className="flex h-full w-full max-w-[1920px] overflow-hidden">
				<a
					href="#main-content"
					className="bg-primary text-primary-foreground absolute top-2 left-2 z-50 -translate-y-16 rounded-md px-3 py-2 text-sm font-medium shadow-[var(--shadow-soft)] transition-transform focus-visible:translate-y-0"
				>
					Skip to content
				</a>
				<Sidebar />
				<main
					id="main-content"
					tabIndex={-1}
					className="flex-1 overflow-y-auto px-4 py-4 outline-none sm:px-6 sm:py-6 lg:px-10 lg:py-8"
				>
					<Outlet />
				</main>
			</div>
		</div>
	);
}

function Sidebar() {
	const { settings } = useShiftVault();
	return (
		<aside
			aria-label="Primary"
			className="bg-card dark:bg-background sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r px-4 py-5 shadow-[var(--shadow-soft)] sm:flex"
		>
			<div className="flex flex-col gap-6">
				<Brand workspaceName={settings.workspaceName} />
				<nav aria-label="Sections" className="flex flex-col gap-1">
					{NAV.map(({ to, label, icon: Icon }) => (
						<NavLink
							key={to}
							to={to}
							end={to === "/"}
							className={({ isActive }) =>
								cn(
									"hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
									isActive
										? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-[var(--shadow-soft)]"
										: "text-muted-foreground"
								)
							}
						>
							<Icon aria-hidden="true" className="size-5 shrink-0" />
							<span>{label}</span>
						</NavLink>
					))}
				</nav>
			</div>
			<div className="flex items-center justify-between gap-2 border-t pt-4">
				<p className="text-muted-foreground text-xs">Local-only data</p>
				<ThemeToggle />
			</div>
		</aside>
	);
}

function Brand({ workspaceName }: { workspaceName: string }) {
	return (
		<div className="flex items-center gap-2.5">
			<div className="size-10 shrink-0 overflow-hidden rounded-xl shadow-[var(--shadow-soft)]">
				<img
					src="/logo-128.png"
					alt="ShiftVault"
					width={40}
					height={40}
					className="size-full object-cover"
				/>
			</div>
			<div className="flex flex-col leading-tight">
				<span className="text-sm font-semibold tracking-tight">ShiftVault</span>
				<span className="text-muted-foreground truncate text-[11px]">{workspaceName}</span>
			</div>
		</div>
	);
}
