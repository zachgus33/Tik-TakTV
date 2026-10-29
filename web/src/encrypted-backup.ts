import { parseTransfer, type Transfer } from "./collections";
import type { HomeCatalogSetting } from "./account";
import type { Provider } from "./types";

const FORMAT = "tiktak-encrypted-setup";
const ITERATIONS = 310_000;

export type SecureSetup = {
  transfer: Transfer;
  provider: Provider | null;
  torboxKey: string;
  realDebridKey: string;
  autoplay: boolean;
  homeCatalogs: HomeCatalogSetting[];
  tmdbKey: string;
};

type Envelope = {
  format: typeof FORMAT;
  version: 1;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string };
  data: string;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const base64ToBytes = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};
const buffer = (value: Uint8Array) => value.slice().buffer as ArrayBuffer;
async function keyFor(passphrase: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: buffer(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSetup(setup: SecureSetup, passphrase: string) {
  if (passphrase.length < 12)
    throw new Error("Use a backup passphrase with at least 12 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(passphrase, salt, ITERATIONS);
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: buffer(iv) },
    key,
    new TextEncoder().encode(JSON.stringify(setup)),
  );
  return JSON.stringify(
    {
      format: FORMAT,
      version: 1,
      kdf: {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: ITERATIONS,
        salt: bytesToBase64(salt),
      },
      cipher: { name: "AES-GCM", iv: bytesToBase64(iv) },
      data: bytesToBase64(new Uint8Array(data)),
    } satisfies Envelope,
    null,
    2,
  );
}

export async function decryptSetup(text: string, passphrase: string): Promise<SecureSetup> {
  let envelope: Envelope;
  try {
    envelope = JSON.parse(text) as Envelope;
  } catch {
    throw new Error("Choose a valid encrypted TikTak TV backup.");
  }
  if (
    envelope?.format !== FORMAT ||
    envelope.version !== 1 ||
    envelope.kdf?.name !== "PBKDF2" ||
    envelope.kdf.hash !== "SHA-256" ||
    envelope.cipher?.name !== "AES-GCM" ||
    envelope.kdf.iterations < 200_000 ||
    envelope.kdf.iterations > 1_000_000
  )
    throw new Error("This encrypted backup format is not supported.");
  try {
    const salt = base64ToBytes(envelope.kdf.salt);
    const iv = base64ToBytes(envelope.cipher.iv);
    if (salt.length !== 16 || iv.length !== 12)
      throw new Error("invalid envelope");
    const key = await keyFor(passphrase, salt, envelope.kdf.iterations);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buffer(iv) },
      key,
      base64ToBytes(envelope.data),
    );
    const raw = JSON.parse(new TextDecoder().decode(plaintext));
    const transfer = parseTransfer(JSON.stringify(raw.transfer));
    if (
      raw.provider !== null &&
      (typeof raw.provider !== "object" || typeof raw.provider.server !== "string")
    )
      throw new Error("invalid provider");
    return {
      transfer,
      provider: raw.provider ?? null,
      torboxKey: typeof raw.torboxKey === "string" ? raw.torboxKey : "",
      realDebridKey:
        typeof raw.realDebridKey === "string" ? raw.realDebridKey : "",
      autoplay: raw.autoplay !== false,
      homeCatalogs: Array.isArray(raw.homeCatalogs) ? raw.homeCatalogs : [],
      tmdbKey: typeof raw.tmdbKey === "string" ? raw.tmdbKey : "",
    };
  } catch {
    throw new Error("The passphrase is incorrect or the backup is damaged.");
  }
}

