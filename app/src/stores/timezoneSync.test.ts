import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Me } from "../api/types";

const mocks = vi.hoisted(() => ({ me: vi.fn(), updateMe: vi.fn(), device: vi.fn() }));
vi.mock("../api/client", async (original) => ({ ...(await original<typeof import("../api/client")>()), api: mocks }));
vi.mock("../api/tokenStorage", () => ({
  loadSession: () => ({ accessToken: "a", refreshToken: "r", username: "u" }),
  clearSession: vi.fn(),
  saveSession: vi.fn(),
}));
vi.mock("../lib/timezone", async (original) => ({
  ...(await original<typeof import("../lib/timezone")>()),
  deviceTimeZone: mocks.device,
}));

import { useAuth } from "./auth";

const me = (timezone: string): Me => ({
  id: "u1", username: "u", display_name: "U", email: "u@example.com", avatar_url: null, unit_system: "metric", timezone,
});

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.setState({ status: "loading", user: null, error: null });
});

describe("the profile zone follows the device", () => {
  it("a new account (UTC) takes the device's zone when the app starts", async () => {
    mocks.device.mockReturnValue("Asia/Kolkata");
    mocks.me.mockResolvedValue(me("UTC"));
    mocks.updateMe.mockResolvedValue(me("Asia/Kolkata"));
    await useAuth.getState().init();
    expect(mocks.updateMe).toHaveBeenCalledWith({ timezone: "Asia/Kolkata" });
    expect(useAuth.getState().user?.timezone).toBe("Asia/Kolkata");
    expect(useAuth.getState().status).toBe("signed-in");
  });

  it("asks the server for nothing when they already agree", async () => {
    mocks.device.mockReturnValue("Asia/Kolkata");
    mocks.me.mockResolvedValue(me("Asia/Kolkata"));
    await useAuth.getState().init();
    expect(mocks.updateMe).not.toHaveBeenCalled();
  });

  it("a failed update never blocks signing in", async () => {
    mocks.device.mockReturnValue("Asia/Kolkata");
    mocks.me.mockResolvedValue(me("UTC"));
    mocks.updateMe.mockRejectedValue(new Error("offline"));
    await useAuth.getState().init();
    expect(useAuth.getState().status).toBe("signed-in");
    expect(useAuth.getState().user?.timezone).toBe("UTC");
  });

  it("follows the person when they land somewhere else", async () => {
    mocks.device.mockReturnValue("Asia/Kolkata");
    mocks.me.mockResolvedValue(me("Asia/Kolkata"));
    await useAuth.getState().init();
    mocks.updateMe.mockClear();

    mocks.device.mockReturnValue("America/Los_Angeles");
    mocks.updateMe.mockResolvedValue(me("America/Los_Angeles"));
    await useAuth.getState().syncTimeZone();
    expect(mocks.updateMe).toHaveBeenCalledWith({ timezone: "America/Los_Angeles" });
    expect(useAuth.getState().user?.timezone).toBe("America/Los_Angeles");
  });

  it("does nothing while signed out", async () => {
    mocks.device.mockReturnValue("America/Los_Angeles");
    useAuth.setState({ status: "signed-out", user: null });
    await useAuth.getState().syncTimeZone();
    expect(mocks.updateMe).not.toHaveBeenCalled();
  });
});
