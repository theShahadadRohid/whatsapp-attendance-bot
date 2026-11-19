
import { describe, expect, it } from "vitest";

import { parseWhatsAppCommand } from "../../src/modules/integrations/whatsapp/whatsapp.command.js";

describe("WhatsApp command parser", () => {
  it.each([
    ["IN", { type: "check_in" }],
    ["in", { type: "check_in" }],
    [" IN ", { type: "check_in" }],
    ["OUT", { type: "check_out" }],
    ["out", { type: "check_out" }],
    [" OUT ", { type: "check_out" }],
    ["HELP", { type: "help" }],
    ["help", { type: "help" }],
  ])("parses %s", (text, expected) => {
    expect(parseWhatsAppCommand(text)).toEqual(expected);
  });

  it.each([
    "",
    "Hello",
    "Check in",
    "Check out",
    "IN reason: Traffic jam",
    "OUT note: Personal work",
    "YES",
    "STOP",
    "ENROLL ABC123",
  ])("rejects unsupported command: %s", (text) => {
    expect(parseWhatsAppCommand(text)).toEqual({
      type: "invalid",
    });
  });
});
