import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import type { BookingInput, ContactProtector, ProtectedContact } from "../domain/model.ts";

const LOCAL_DEVELOPMENT_KEY_LABEL = "sudoworks-office-hours-local-development-key-v1";

function encrypt(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function keyFromBase64(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("BOOKING_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

export function keyFromSecret(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function loadLocalEncryptionKey(environment: NodeJS.ProcessEnv = process.env): Buffer {
  const configured = environment.BOOKING_ENCRYPTION_KEY;
  if (configured) return keyFromBase64(configured);
  if (environment.NODE_ENV === "production") {
    throw new Error("BOOKING_ENCRYPTION_KEY is required when NODE_ENV=production.");
  }
  return keyFromSecret(LOCAL_DEVELOPMENT_KEY_LABEL);
}

export function createContactProtector(key: Buffer): ContactProtector {
  if (key.length !== 32) throw new Error("Contact protection requires a 32-byte key.");

  return {
    protect(name, email): ProtectedContact {
      return {
        encryptedName: encrypt(name, key),
        encryptedEmail: encrypt(email, key),
        emailHash: createHmac("sha256", key).update(email, "utf8").digest("base64url"),
      };
    },
    payloadHash(input): string {
      const canonical = JSON.stringify({
        email: input.email,
        name: input.name,
        privacyConsent: input.privacyConsent,
        slotId: input.slotId,
        timezone: input.timezone,
      });
      return createHmac("sha256", key).update(canonical, "utf8").digest("base64url");
    },
  };
}
