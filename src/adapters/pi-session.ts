import { realpathSync } from "node:fs";
import type { SessionIdentity } from "../domain/model.js";

interface SessionContext {
	sessionManager?: { getSessionId?: () => unknown };
}

export function getSessionIdentity(
	context: SessionContext,
	cwd: string,
	canonicalize: (path: string) => string = realpathSync,
): SessionIdentity | undefined {
	const getSessionId = context.sessionManager?.getSessionId;
	if (typeof getSessionId !== "function") return undefined;

	try {
		const value = getSessionId.call(context.sessionManager);
		if (typeof value !== "string" || value.trim().length === 0)
			return undefined;
		return { id: value, cwd: canonicalize(cwd) };
	} catch {
		return undefined;
	}
}
