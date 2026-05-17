import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

export function NotFoundPage() {
	return (
		<div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-24 text-center">
			<p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">404</p>
			<h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
			<p className="text-muted-foreground text-sm">
				That route does not exist. Head back to the dashboard.
			</p>
			<Button asChild>
				<Link to="/">Back to Dashboard</Link>
			</Button>
		</div>
	);
}
