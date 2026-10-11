// Push notifications to the iOS app. CONTRACT STUB — the implementation lands
// with the iOS work (APNs over HTTP/2). Callers may depend on this signature.

export interface PushMessage {
  title: string;
  body: string;
  /** In-app path to open when tapped, e.g. "/" or "/analyze/NVDA". */
  path?: string;
  kind?: "brief" | "kill" | "level" | "system";
}

/** Best-effort: never throws. Resolves to the number of devices notified. */
export async function notifyUser(userId: string, msg: PushMessage): Promise<number> {
  void userId; void msg;
  return 0;
}
