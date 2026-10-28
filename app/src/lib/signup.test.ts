import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import type { GoogleLoginResult } from "../api/types";
import { describeSignupError, needsSignup } from "./signup";
import { isValidUsername, normalizeUsername } from "./username";

describe("username", () => {
  it("lowercases and strips whitespace", () => expect(normalizeUsername(" Jo hn_9 ")).toBe("john_9"));
  it("validates length and charset", () => {
    for (const ok of ["abc", "a_1", "a".repeat(30)]) expect(isValidUsername(ok)).toBe(true);
    for (const bad of ["ab", "a".repeat(31), "Abc", "a-b", "a.b", "", "é_é"]) expect(isValidUsername(bad)).toBe(false);
  });
});

describe("needsSignup", () => {
  const login = { signup_required: false, access_token: "a", token_type: "Bearer", expires_in: 1, refresh_token: "r",
    refresh_expires_in: 1, user_id: "u", username: "x" } as const;
  it("narrows the union", () => {
    const s: GoogleLoginResult = { signup_required: true, signup_token: "t", suggested_username: "x",
      display_name: "X", email: "x@y.z", avatar_url: null };
    expect(needsSignup(s)).toBe(true);
    expect(needsSignup(login)).toBe(false);
  });
});

describe("describeSignupError", () => {
  const err = (status: number, code?: string, msg = "server says") => new ApiError(status, msg, { error: msg, code });
  it("maps codes", () => {
    expect(describeSignupError(err(409, "username_taken")).kind).toBe("field");
    expect(describeSignupError(err(400, "invalid_username")).kind).toBe("field");
    expect(describeSignupError(err(400, "reserved_username")).kind).toBe("field");
    expect(describeSignupError(err(409, "email_in_use"))).toMatchObject({ kind: "blocked", retry: false });
    expect(describeSignupError(err(409, "identity_exists"))).toMatchObject({ kind: "blocked", retry: true });
  });
  it("401 means expired, regardless of code", () => {
    expect(describeSignupError(err(401))).toEqual({ kind: "expired", message: "That took too long, please sign in again." });
  });
  it("falls back to the server text, and to a generic message for non-API errors", () => {
    expect(describeSignupError(err(500, "weird", "boom"))).toEqual({ kind: "other", message: "boom" });
    expect(describeSignupError(new Error("x")).kind).toBe("other");
  });
});
