/** Generate a short, URL-safe random ID. */
export function newId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	// Fallback for very old browsers — never expected to run on modern targets.
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
