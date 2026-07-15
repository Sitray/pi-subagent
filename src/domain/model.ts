export interface SessionIdentity {
	id: string;
	cwd: string;
}

export interface SubagentStatusConfig {
	shortcut: string;
	completionGraceMs: number;
	refreshMs: number;
	maxAgents: number;
}
