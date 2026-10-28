import { ApiError } from "../api/client";
import type { GoogleLoginResult, GoogleSignupRequired, UsernameUnavailableReason } from "../api/types";

export function needsSignup(r: GoogleLoginResult): r is GoogleSignupRequired {
  return r.signup_required === true;
}

export const EXPIRED_MESSAGE = "That took too long, please sign in again.";

export function usernameReasonMessage(reason: UsernameUnavailableReason | undefined): string {
  switch (reason) {
    case "taken": return "That username is taken.";
    case "reserved": return "That username is reserved. Try another.";
    case "invalid": return "That username isn't valid.";
    default: return "That username isn't available.";
  }
}

/** What the signup screen should do with a failed POST /auth/google/signup. */
export type SignupFailure =
  | { kind: "expired"; message: string } // go back to login
  | { kind: "blocked"; message: string; retry: boolean } // dead end here; offer "Back to sign in"
  | { kind: "field"; message: string } // fix the username and try again
  | { kind: "other"; message: string };

export function describeSignupError(e: unknown): SignupFailure {
  if (!(e instanceof ApiError)) return { kind: "other", message: "Something went wrong" };
  if (e.status === 401) return { kind: "expired", message: EXPIRED_MESSAGE };
  const code = (e.data as { code?: unknown } | undefined)?.code;
  switch (code) {
    case "username_taken": return { kind: "field", message: usernameReasonMessage("taken") };
    case "invalid_username": return { kind: "field", message: usernameReasonMessage("invalid") };
    case "reserved_username": return { kind: "field", message: usernameReasonMessage("reserved") };
    case "email_in_use":
      return { kind: "blocked", retry: false, message: "An account with this email already exists." };
    case "identity_exists":
      return { kind: "blocked", retry: true, message: "This Google account is already registered. Try signing in again." };
    default: return { kind: "other", message: e.message };
  }
}
