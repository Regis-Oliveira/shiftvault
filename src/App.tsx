import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataProvider } from "@/data/DataProvider";

const DashboardPage = lazy(() =>
	import("@/pages/Dashboard").then((m) => ({ default: m.DashboardPage }))
);
const MemberDetailPage = lazy(() =>
	import("@/pages/MemberDetail").then((m) => ({ default: m.MemberDetailPage }))
);
const CalendarPage = lazy(() =>
	import("@/pages/Calendar").then((m) => ({ default: m.CalendarPage }))
);
const ReportsPage = lazy(() => import("@/pages/Reports").then((m) => ({ default: m.ReportsPage })));
const ReconcilePage = lazy(() =>
	import("@/pages/Reconcile").then((m) => ({ default: m.ReconcilePage }))
);
const SettingsPage = lazy(() =>
	import("@/pages/Settings").then((m) => ({ default: m.SettingsPage }))
);
const NotFoundPage = lazy(() =>
	import("@/pages/NotFound").then((m) => ({ default: m.NotFoundPage }))
);

function PageFallback() {
	return (
		<div
			className="text-muted-foreground flex h-full items-center justify-center text-sm"
			role="status"
			aria-live="polite"
		>
			Loading…
		</div>
	);
}

export default function App() {
	return (
		<ThemeProvider>
			<DataProvider>
				<TooltipProvider delayDuration={150}>
					<Toaster />
					<BrowserRouter>
						<Routes>
							<Route element={<AppShell />}>
								<Route
									index
									element={
										<Suspense fallback={<PageFallback />}>
											<DashboardPage />
										</Suspense>
									}
								/>
								<Route
									path="members/:id"
									element={
										<Suspense fallback={<PageFallback />}>
											<MemberDetailPage />
										</Suspense>
									}
								/>
								<Route
									path="calendar"
									element={
										<Suspense fallback={<PageFallback />}>
											<CalendarPage />
										</Suspense>
									}
								/>
								<Route
									path="reports"
									element={
										<Suspense fallback={<PageFallback />}>
											<ReportsPage />
										</Suspense>
									}
								/>
								<Route
									path="reconcile"
									element={
										<Suspense fallback={<PageFallback />}>
											<ReconcilePage />
										</Suspense>
									}
								/>
								<Route
									path="settings"
									element={
										<Suspense fallback={<PageFallback />}>
											<SettingsPage />
										</Suspense>
									}
								/>
								<Route
									path="*"
									element={
										<Suspense fallback={<PageFallback />}>
											<NotFoundPage />
										</Suspense>
									}
								/>
							</Route>
						</Routes>
					</BrowserRouter>
				</TooltipProvider>
			</DataProvider>
		</ThemeProvider>
	);
}
