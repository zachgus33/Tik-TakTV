import type { Provider } from "./types";

type StoredProviderSetup = {
  provider?: Provider | null;
  accountProvider?: Provider | null;
};

export function resolveAccountProvider(
  profileId: number,
  ownWeb: StoredProviderSetup,
  accountWeb: StoredProviderSetup,
): Provider | null {
  if (profileId === 1) {
    return Object.prototype.hasOwnProperty.call(ownWeb, "accountProvider")
      ? (ownWeb.accountProvider ?? null)
      : (ownWeb.provider ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(accountWeb, "accountProvider"))
    return accountWeb.accountProvider ?? null;
  return accountWeb.provider ?? ownWeb.provider ?? null;
}
