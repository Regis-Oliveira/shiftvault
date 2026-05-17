import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src")
		}
	},
	build: {
		// Bump warning threshold and split vendor + heavy date deps into long-cached chunks.
		chunkSizeWarningLimit: 700,
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (!id.includes("node_modules")) return;
					if (id.includes("react-day-picker") || id.includes("date-fns")) return "calendar";
					if (id.includes("react-hook-form") || id.includes("@hookform") || id.includes("zod"))
						return "forms";
					if (id.includes("radix-ui") || id.includes("@radix-ui")) return "radix";
					return "vendor";
				}
			}
		}
	}
});
