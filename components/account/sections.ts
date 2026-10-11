// /account/<sub> deep links. A paywall's "Account → Plan", a push about a
// failed card or a support reply can link straight to the right group; a few
// subs also open the sheet they name.

export type AccountSection = "plan" | "alerts" | "appearance" | "security" | "support" | "admin" | "danger";
export type AccountSheet = "password" | "voices";

export const SECTION_ID: Record<AccountSection, string> = {
  plan: "account-plan",
  alerts: "account-alerts",
  appearance: "account-appearance",
  security: "account-security",
  support: "account-support",
  admin: "account-admin",
  danger: "account-danger",
};

const ALIASES: Record<string, { section: AccountSection; open?: AccountSheet }> = {
  plan: { section: "plan" },
  billing: { section: "plan" },
  subscription: { section: "plan" },
  usage: { section: "plan" },
  alerts: { section: "alerts" },
  notifications: { section: "alerts" },
  brief: { section: "alerts" },
  voices: { section: "alerts", open: "voices" },
  appearance: { section: "appearance" },
  theme: { section: "appearance" },
  security: { section: "security" },
  password: { section: "security", open: "password" },
  support: { section: "support" },
  help: { section: "support" },
  legal: { section: "support" },
  admin: { section: "admin" },
  // Deliberately never auto-opens the delete sheet: a link should not be one
  // tap away from erasing an account.
  delete: { section: "danger" },
};

export function resolveAccountSub(sub: string | undefined | null): { section: AccountSection; open?: AccountSheet } | null {
  if (!sub) return null;
  return ALIASES[sub.toLowerCase()] ?? null;
}
