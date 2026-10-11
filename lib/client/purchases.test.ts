// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  activeEntitlements, findPackage, hasLiveWebSubscription, identifyPurchaser, isCancellation, productIdFor, purchase,
  purchaseErrorMessage, resetPurchasesState, restore, signOutPurchaser,
} from "./purchases";

// A RevenueCat-shaped offerings payload, as the native plugin returns it.
const pkg = (id: string, productId: string, packageType: string, offering: string) => ({
  identifier: id, packageType, offeringIdentifier: offering,
  product: { identifier: productId, priceString: "$19.99" },
  presentedOfferingContext: { offeringIdentifier: offering, placementIdentifier: null, targetingContext: null },
});
const OFFERINGS = {
  current: { identifier: "default", availablePackages: [pkg("$rc_monthly", "bacon_pro_monthly", "MONTHLY", "default"), pkg("$rc_annual", "bacon_pro_yearly", "ANNUAL", "default")] },
  all: {
    default: { identifier: "default", availablePackages: [pkg("$rc_monthly", "bacon_pro_monthly", "MONTHLY", "default"), pkg("$rc_annual", "bacon_pro_yearly", "ANNUAL", "default")] },
    desk: { identifier: "desk", availablePackages: [pkg("$rc_monthly", "bacon_desk_monthly", "MONTHLY", "desk"), pkg("$rc_annual", "bacon_desk_yearly", "ANNUAL", "desk")] },
  },
};

let Purchases: Record<string, ReturnType<typeof vi.fn>>;
// The fake SDK's state: configured or not, and who it thinks the user is.
let sdk: { configured: boolean; appUserID: string };

function installCapacitor(native = true) {
  sdk = { configured: false, appUserID: "$RCAnonymousID:0000" };
  Purchases = {
    isConfigured: vi.fn(async () => ({ isConfigured: sdk.configured })),
    configure: vi.fn((o: { appUserID?: string }) => { sdk.configured = true; if (o?.appUserID) sdk.appUserID = o.appUserID; return "callback-id"; }),
    getAppUserID: vi.fn(async () => ({ appUserID: sdk.appUserID })),
    logIn: vi.fn(async (o: { appUserID: string }) => { sdk.appUserID = o.appUserID; return { customerInfo: {}, created: false }; }),
    logOut: vi.fn(async () => { sdk.appUserID = "$RCAnonymousID:1111"; return { customerInfo: {} }; }),
    getOfferings: vi.fn(async () => OFFERINGS),
    purchasePackage: vi.fn(async () => ({ productIdentifier: "bacon_pro_yearly", customerInfo: { entitlements: { active: { pro: { isActive: true } } } } })),
    restorePurchases: vi.fn(async () => ({ entitlements: { active: { pro: {} } } })),
  };
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => native,
    getPlatform: () => (native ? "ios" : "web"),
    Plugins: { Purchases },
  };
}

const fetchMock = vi.fn();
const savedKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY;

beforeEach(() => {
  resetPurchasesState();
  installCapacitor();
  process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY = "appl_test";
  fetchMock.mockReset();
  // /api/me: the signed-in account, already on the App Store plan (webhook landed).
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ user: { id: "user-1" }, plan: { plan: "pro", source: "subscription", provider: "app_store" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  if (savedKey === undefined) delete process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY; else process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY = savedKey;
});

describe("product mapping", () => {
  it("names App Store products bacon_<plan>_<monthly|yearly>", () => {
    expect(productIdFor("pro", "month")).toBe("bacon_pro_monthly");
    expect(productIdFor("pro", "year")).toBe("bacon_pro_yearly");
    expect(productIdFor("desk", "month")).toBe("bacon_desk_monthly");
    expect(productIdFor("desk", "year")).toBe("bacon_desk_yearly");
  });

  it("finds the exact product in any offering, current first", () => {
    expect(findPackage(OFFERINGS, "pro", "year")?.product.identifier).toBe("bacon_pro_yearly");
    expect(findPackage(OFFERINGS, "desk", "month")?.product.identifier).toBe("bacon_desk_monthly");
  });

  it("falls back to the MONTHLY/ANNUAL package of an offering named after the plan", () => {
    const renamed = {
      current: null,
      all: { desk: { identifier: "desk", availablePackages: [pkg("$rc_monthly", "desk_m_v2", "MONTHLY", "desk"), pkg("$rc_annual", "desk_y_v2", "ANNUAL", "desk")] } },
    };
    expect(findPackage(renamed, "desk", "year")?.product.identifier).toBe("desk_y_v2");
    expect(findPackage(renamed, "desk", "month")?.product.identifier).toBe("desk_m_v2");
    expect(findPackage(renamed, "pro", "month")).toBeNull();
    expect(findPackage(null, "pro", "month")).toBeNull();
  });

  it("reads active entitlements", () => {
    expect(activeEntitlements({ entitlements: { active: { pro: {}, desk: {} } } })).toEqual(["pro", "desk"]);
    expect(activeEntitlements(null)).toEqual([]);
  });
});

describe("errors", () => {
  it("recognises a user cancellation in every shape the bridge produces", () => {
    expect(isCancellation({ code: "1" })).toBe(true);
    expect(isCancellation({ code: 1 })).toBe(true);
    expect(isCancellation({ message: "x", data: { userCancelled: true } })).toBe(true);
    expect(isCancellation({ userCancelled: true })).toBe(true);
    expect(isCancellation({ code: "2" })).toBe(false);
    expect(isCancellation(new Error("boom"))).toBe(false);
  });
  it("turns error codes into sentences", () => {
    expect(purchaseErrorMessage({ code: "20" })).toMatch(/waiting for approval/);
    expect(purchaseErrorMessage({ code: "10" })).toMatch(/connection/);
    expect(purchaseErrorMessage({ code: "999", message: "Something specific" })).toBe("Something specific");
    expect(purchaseErrorMessage({})).toMatch(/haven't been charged/);
  });
});

describe("identifyPurchaser", () => {
  it("configures once with the Supabase user id as the app user id", async () => {
    await identifyPurchaser("user-1");
    await identifyPurchaser("user-1");
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
    expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: "appl_test", appUserID: "user-1" });
    expect(Purchases.logIn).not.toHaveBeenCalled();
  });

  it("logs in when the SDK is already configured for someone else", async () => {
    sdk = { configured: true, appUserID: "user-0" };
    await identifyPurchaser("user-2");
    expect(Purchases.configure).not.toHaveBeenCalled();
    expect(Purchases.logIn).toHaveBeenCalledWith({ appUserID: "user-2" });
  });

  it("does nothing on the web or without an API key", async () => {
    installCapacitor(false);
    await identifyPurchaser("user-1");
    delete process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY;
    installCapacitor(true);
    await identifyPurchaser("user-1");
    expect(Purchases.configure).not.toHaveBeenCalled();
  });
});

describe("signOutPurchaser", () => {
  it("logs a signed-in purchaser out", async () => {
    await identifyPurchaser("user-1");
    await signOutPurchaser();
    expect(Purchases.logOut).toHaveBeenCalledTimes(1);
    // …and the next identify logs back in rather than trusting a stale cache.
    await identifyPurchaser("user-1");
    expect(Purchases.logIn).toHaveBeenCalledWith({ appUserID: "user-1" });
  });
  it("leaves an unconfigured or already-anonymous SDK alone", async () => {
    await signOutPurchaser();
    sdk.configured = true;
    await signOutPurchaser();
    expect(Purchases.logOut).not.toHaveBeenCalled();
  });
});

describe("purchase", () => {
  it("buys the matching package and resolves true on an active entitlement", async () => {
    await expect(purchase("pro", "year")).resolves.toBe(true);
    expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: "appl_test", appUserID: "user-1" });
    const arg = Purchases.purchasePackage.mock.calls[0][0] as { aPackage: { product: { identifier: string }; presentedOfferingContext: unknown } };
    expect(arg.aPackage.product.identifier).toBe("bacon_pro_yearly");
    expect(arg.aPackage.presentedOfferingContext).toBeTruthy();
  });

  it("logs the anonymous SDK user in as the account before buying", async () => {
    sdk = { configured: true, appUserID: "$RCAnonymousID:abcd" };
    await expect(purchase("pro", "month")).resolves.toBe(true);
    expect(Purchases.logIn).toHaveBeenCalledWith({ appUserID: "user-1" });
    expect(Purchases.logIn.mock.invocationCallOrder[0]).toBeLessThan(Purchases.purchasePackage.mock.invocationCallOrder[0]);
  });

  it("refuses to buy while the SDK is still anonymous", async () => {
    sdk = { configured: true, appUserID: "$RCAnonymousID:abcd" };
    Purchases.logIn.mockResolvedValue({ customerInfo: {} }); // a logIn that silently didn't take
    await expect(purchase("pro", "month")).rejects.toThrow(/Couldn't link/);
    expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  });

  it("re-checks the native user even when this page already identified it", async () => {
    await identifyPurchaser("user-1");
    sdk.appUserID = "$RCAnonymousID:zzzz"; // logged out behind our back
    await expect(purchase("pro", "year")).resolves.toBe(true);
    expect(Purchases.logIn).toHaveBeenCalledWith({ appUserID: "user-1" });
  });

  it("won't sell an App Store plan to a live web (Stripe) subscriber", async () => {
    const me = { user: { id: "user-1" }, plan: { plan: "pro", source: "subscription", provider: "stripe" } };
    expect(hasLiveWebSubscription(me)).toBe(true);
    expect(hasLiveWebSubscription({ ...me, plan: { ...me.plan, source: "free" } })).toBe(false);
    await expect(purchase("desk", "year", me)).rejects.toThrow(/You subscribe on the web/);
    // …also when the account is read from /api/me rather than passed in.
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(me), { status: 200 }));
    await expect(purchase("desk", "year")).rejects.toThrow(/You subscribe on the web/);
    expect(Purchases.getOfferings).not.toHaveBeenCalled();
    expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  });

  it("uses the account it's given instead of fetching it", async () => {
    const me = { user: { id: "user-1" }, plan: { plan: "free", source: "trial", provider: null } };
    Purchases.purchasePackage.mockRejectedValue({ code: "1" });
    await expect(purchase("pro", "month", me)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves false when the user cancels the App Store sheet", async () => {
    Purchases.purchasePackage.mockRejectedValue(Object.assign(new Error("Purchase was cancelled."), { code: "1", data: { userCancelled: true } }));
    await expect(purchase("desk", "month")).resolves.toBe(false);
  });

  it("throws a readable error for anything else", async () => {
    Purchases.purchasePackage.mockRejectedValue(Object.assign(new Error("PAYMENT_PENDING"), { code: "20" }));
    await expect(purchase("pro", "month")).rejects.toThrow(/waiting for approval/);
  });

  it("throws when the product isn't in any offering", async () => {
    Purchases.getOfferings.mockResolvedValue({ current: null, all: {} });
    await expect(purchase("pro", "month")).rejects.toThrow(/isn't available/);
  });

  it("throws if signed out", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 }));
    await expect(purchase("pro", "month")).rejects.toThrow(/Sign in/);
  });
});

describe("restore", () => {
  it("is true when any entitlement comes back active", async () => {
    await expect(restore()).resolves.toBe(true);
  });
  it("logs the account in before restoring", async () => {
    sdk = { configured: true, appUserID: "$RCAnonymousID:abcd" };
    await expect(restore()).resolves.toBe(true);
    expect(Purchases.logIn.mock.invocationCallOrder[0]).toBeLessThan(Purchases.restorePurchases.mock.invocationCallOrder[0]);
  });
  it("is false when nothing is active", async () => {
    Purchases.restorePurchases.mockResolvedValue({ entitlements: { active: {} } });
    await expect(restore()).resolves.toBe(false);
  });
  it("is false on the web", async () => {
    installCapacitor(false);
    await expect(restore()).resolves.toBe(false);
  });
});
