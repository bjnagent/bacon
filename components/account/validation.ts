// Client-side checks for the Account sheets. The server re-checks everything;
// these exist so the mistake is shown next to the field, before a round trip.

export const MIN_PASSWORD = 8;

export function validatePassword(pw: string, confirm: string): { password: string | null; confirm: string | null } {
  let password: string | null = null;
  if (!pw) password = "Enter a new password.";
  else if (pw.length < MIN_PASSWORD) password = `Use at least ${MIN_PASSWORD} characters.`;
  else if (new TextEncoder().encode(pw).length > 72) password = "Use 72 characters or fewer.";
  let c: string | null = null;
  if (!password) {
    if (!confirm) c = "Type the new password again.";
    else if (confirm !== pw) c = "Passwords don't match.";
  }
  return { password, confirm: c };
}

/** The word someone has to type to delete their account. */
export const DELETE_WORD = "DELETE";

export function deleteConfirmed(typed: string): boolean {
  return typed.trim() === DELETE_WORD;
}
