import { describe, expect, it } from "vitest";
import { initials } from "../components/Avatar";
import { describeNotification } from "./notifications";

const actor = { id: "u1", username: "ruchika_j", display_name: "Ruchika Jaiswal" };

describe("describeNotification", () => {
  it("opens the person for a request and an acceptance", () => {
    expect(describeNotification({ kind: "friend_request", actor, workout_id: null })).toEqual({
      text: "Ruchika Jaiswal sent you a friend request", to: "/people/u1",
    });
    expect(describeNotification({ kind: "friend_accepted", actor, workout_id: null }).text).toBe("Ruchika Jaiswal accepted your friend request");
  });

  it("opens your own workout for a like", () => {
    expect(describeNotification({ kind: "workout_liked", actor, workout_id: "w9" })).toEqual({
      text: "Ruchika Jaiswal liked your workout", to: "/history/w9",
    });
  });

  it("does not break when a like has lost its workout", () => {
    expect(describeNotification({ kind: "workout_liked", actor, workout_id: null }).to).toBe("/");
  });
});

describe("initials", () => {
  it("takes the first and last name's first letters", () => {
    expect(initials("Ruchika Jaiswal")).toBe("RJ");
    expect(initials("  ada   king lovelace ")).toBe("AL");
    expect(initials("swarnim")).toBe("S");
    expect(initials("Élodie")).toBe("É");
  });

  it("has an answer for an empty name", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});
