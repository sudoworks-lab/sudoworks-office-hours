import assert from "node:assert/strict";
import { test } from "node:test";
import { createContactProtector, keyFromSecret } from "../src/shared/contact-protector.ts";
import { JsonLogger } from "../src/shared/logger.ts";
import { validInput } from "./helpers.ts";

test("contact protection uses randomized ciphertext and keyed stable equality hashes", () => {
  const protector = createContactProtector(keyFromSecret("security-test-key-material-long-enough"));
  const first = protector.protect("Private Name", "private@example.test");
  const second = protector.protect("Private Name", "private@example.test");
  assert.notEqual(first.encryptedName, second.encryptedName);
  assert.notEqual(first.encryptedEmail, second.encryptedEmail);
  assert.equal(first.emailHash, second.emailHash);
  assert.doesNotMatch(first.encryptedName, /Private Name/u);
  assert.equal(protector.payloadHash(validInput), protector.payloadHash(validInput));
});

test("structured logger removes contact fields", (context) => {
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = ((value: string | Uint8Array) => {
    output += value.toString();
    return true;
  }) as typeof process.stdout.write;
  context.after(() => { process.stdout.write = originalWrite; });

  new JsonLogger().log({
    event: "privacy_check",
    name: "Private Name",
    email: "private@example.test",
    requestId: "request-1",
  });
  const entry = JSON.parse(output) as Record<string, unknown>;
  assert.equal(entry.event, "privacy_check");
  assert.equal(entry.requestId, "request-1");
  assert.equal("name" in entry, false);
  assert.equal("email" in entry, false);
  assert.doesNotMatch(output, /private@example\.test/u);
});
