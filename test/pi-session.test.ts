import { describe, expect, it, vi } from "vitest";
import { getSessionIdentity } from "../src/adapters/pi-session.js";

describe("getSessionIdentity", () => {
	it("uses only sessionManager.getSessionId and canonical cwd", () => {
		const getSessionId = vi.fn(() => "session-42");
		const hostileContext: Parameters<typeof getSessionIdentity>[0] & {
			sessionId: string;
		} = {
			sessionManager: { getSessionId },
			sessionId: "alternate",
		};
		const identity = getSessionIdentity(
			hostileContext,
			"/work/../canonical",
			() => "/canonical",
		);
		expect(identity).toEqual({ id: "session-42", cwd: "/canonical" });
		expect(getSessionId).toHaveBeenCalledOnce();
	});

	it("fails closed when the authoritative method is absent", () => {
		const hostileContext: Parameters<typeof getSessionIdentity>[0] & {
			sessionId: string;
		} = {
			sessionId: "alternate",
		};
		expect(
			getSessionIdentity(hostileContext, "/work", (path) => path),
		).toBeUndefined();
	});

	it("fails closed for blank or throwing authoritative identity", () => {
		expect(
			getSessionIdentity(
				{ sessionManager: { getSessionId: () => "  " } },
				"/work",
				(path) => path,
			),
		).toBeUndefined();
		expect(
			getSessionIdentity(
				{
					sessionManager: {
						getSessionId: () => {
							throw new Error("gone");
						},
					},
				},
				"/work",
				(path) => path,
			),
		).toBeUndefined();
	});

	it("fails closed when cwd cannot be canonicalized", () => {
		const context = {
			sessionManager: { getSessionId: () => "session-42" },
			sessionId: "alternate",
		};
		expect(
			getSessionIdentity(context, "/missing", () => {
				throw new Error("missing");
			}),
		).toBeUndefined();
	});
});
