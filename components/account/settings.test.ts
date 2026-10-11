import { describe, it, expect } from "vitest";
import { MAX_VOICES, SETTINGS_DEFAULTS, isValidTimeZone, normalizeSettings, parseSettingsPatch, parseVoices, voicesPreview } from "./settings";
import { deleteConfirmed, validatePassword } from "./validation";
import { resolveAccountSub } from "./sections";

describe("parseSettingsPatch", () => {
  const NOW = new Date("2026-10-11T12:00:00Z");

  it("accepts each known field and reports the paid features it switches on", () => {
    const r = parseSettingsPatch({ scout_interval_minutes: 1440, watch_enabled: true, brief_email_enabled: true, push_enabled: false }, NOW);
    expect(r).toEqual({
      ok: true,
      patch: { scout_interval_minutes: 1440, watch_enabled: true, brief_email_enabled: true, push_enabled: false },
      enabling: ["personal_brief", "kill_watch", "email_brief"],
    });
  });

  it("never needs a plan to turn something off", () => {
    const r = parseSettingsPatch({ scout_interval_minutes: 0, watch_enabled: false, brief_email_enabled: false });
    expect(r.ok && r.enabling).toEqual([]);
  });

  it("rejects wrong types instead of coercing them", () => {
    expect(parseSettingsPatch({ push_enabled: "yes" })).toEqual({ ok: false, error: "push_enabled must be true or false." });
    expect(parseSettingsPatch({ watch_enabled: 1 }).ok).toBe(false);
    expect(parseSettingsPatch({ scout_interval_minutes: "1440" }).ok).toBe(false);
    expect(parseSettingsPatch({ scout_interval_minutes: Number.NaN }).ok).toBe(false);
  });

  it("clamps and rounds the cadence", () => {
    const r = parseSettingsPatch({ scout_interval_minutes: -5 });
    expect(r.ok && r.patch.scout_interval_minutes).toBe(0);
    const r2 = parseSettingsPatch({ scout_interval_minutes: 999_999.4 });
    expect(r2.ok && r2.patch.scout_interval_minutes).toBe(10080);
  });

  it("validates time zones against the runtime's IANA database", () => {
    expect(parseSettingsPatch({ timezone: "Asia/Singapore" })).toMatchObject({ ok: true, patch: { timezone: "Asia/Singapore" } });
    expect(parseSettingsPatch({ timezone: "Mars/Olympus" }).ok).toBe(false);
    expect(parseSettingsPatch({ timezone: "x".repeat(65) }).ok).toBe(false);
    expect(parseSettingsPatch({ timezone: null })).toMatchObject({ ok: true, patch: { timezone: null } });
  });

  it("stamps onboarded_at with the server's clock and accepts only true", () => {
    expect(parseSettingsPatch({ onboarded_at: true }, NOW)).toMatchObject({ ok: true, patch: { onboarded_at: "2026-10-11T12:00:00.000Z" } });
    expect(parseSettingsPatch({ onboarded_at: "2020-01-01" }).ok).toBe(false);
    expect(parseSettingsPatch({ onboarded_at: false }).ok).toBe(false);
  });

  it("normalises voices and enforces the limit", () => {
    expect(parseSettingsPatch({ voices: "elerianm,  @LynAldenContact\n@elerianm" })).toMatchObject({ ok: true, patch: { voices: "@elerianm, @LynAldenContact" } });
    const many = Array.from({ length: MAX_VOICES + 1 }, (_, i) => `@v${i}`).join(",");
    expect(parseSettingsPatch({ voices: many }).ok).toBe(false);
    expect(parseSettingsPatch({ voices: "a".repeat(401) }).ok).toBe(false);
  });

  it("ignores unknown keys but refuses an empty patch", () => {
    expect(parseSettingsPatch({ user_id: "someone-else", last_sweep_at: "x" })).toEqual({ ok: false, error: "Nothing to update." });
    const r = parseSettingsPatch({ user_id: "someone-else", push_enabled: true });
    expect(r.ok && r.patch).toEqual({ push_enabled: true });
  });
});

describe("parseVoices", () => {
  it("adds @ to bare handles and keeps names as written", () => {
    expect(parseVoices("elerianm, Stan Druckenmiller").voices).toEqual(["@elerianm", "Stan Druckenmiller"]);
  });
  it("dedupes case-insensitively and skips blanks", () => {
    expect(parseVoices("@A, a,, ,@").voices).toEqual(["@A"]);
  });
  it("explains what's wrong", () => {
    expect(parseVoices("x".repeat(41)).error).toMatch(/too long/);
    expect(parseVoices(Array.from({ length: 10 }, (_, i) => `v${i}`).join(",")).error).toBe("Up to 8 voices — remove 2 to save.");
  });
});

describe("voicesPreview", () => {
  it("summarises the list for a row value", () => {
    expect(voicesPreview("")).toBe("None");
    expect(voicesPreview("@a")).toBe("@a");
    expect(voicesPreview("@a, @b, @c, @d")).toBe("@a, @b +2");
  });
});

describe("normalizeSettings", () => {
  it("answers defaults for a missing row, with the brief off", () => {
    expect(normalizeSettings(null)).toEqual(SETTINGS_DEFAULTS);
    expect(SETTINGS_DEFAULTS.scout_interval_minutes).toBe(0);
  });
  it("fills columns an older database lacks", () => {
    const s = normalizeSettings({ scout_interval_minutes: 1440, voices: "@a" });
    expect(s).toMatchObject({ scout_interval_minutes: 1440, voices: "@a", push_enabled: true, timezone: null });
  });
  it("treats a NULL cadence as off, like the sweep does", () => {
    expect(normalizeSettings({ scout_interval_minutes: null }).scout_interval_minutes).toBe(0);
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });
});

describe("validatePassword", () => {
  it("checks length first, then the confirmation", () => {
    expect(validatePassword("", "")).toEqual({ password: "Enter a new password.", confirm: null });
    expect(validatePassword("short", "short")).toEqual({ password: "Use at least 8 characters.", confirm: null });
    expect(validatePassword("long enough", "")).toEqual({ password: null, confirm: "Type the new password again." });
    expect(validatePassword("long enough", "long enougH")).toEqual({ password: null, confirm: "Passwords don't match." });
    expect(validatePassword("long enough", "long enough")).toEqual({ password: null, confirm: null });
  });
  it("refuses what bcrypt would truncate", () => {
    expect(validatePassword("é".repeat(37), "é".repeat(37)).password).toBe("Use 72 characters or fewer.");
  });
});

describe("deleteConfirmed", () => {
  it("needs the exact word", () => {
    expect(deleteConfirmed("DELETE")).toBe(true);
    expect(deleteConfirmed(" DELETE ")).toBe(true);
    expect(deleteConfirmed("delete")).toBe(false);
    expect(deleteConfirmed("DELET")).toBe(false);
  });
});

describe("resolveAccountSub", () => {
  it("maps deep links to groups and sheets", () => {
    expect(resolveAccountSub("plan")).toEqual({ section: "plan" });
    expect(resolveAccountSub("Billing")).toEqual({ section: "plan" });
    expect(resolveAccountSub("password")).toEqual({ section: "security", open: "password" });
    expect(resolveAccountSub("voices")).toEqual({ section: "alerts", open: "voices" });
    expect(resolveAccountSub(undefined)).toBeNull();
    expect(resolveAccountSub("nope")).toBeNull();
  });
  it("never opens the delete sheet from a link", () => {
    expect(resolveAccountSub("delete")).toEqual({ section: "danger" });
  });
});
