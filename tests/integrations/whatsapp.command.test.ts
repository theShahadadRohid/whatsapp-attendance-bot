
import { describe, expect, it } from "vitest";

import { parseWhatsAppCommand } from "../../src/modules/integrations/whatsapp/whatsapp.command.js";

describe("WhatsApp command parser", () => {
  describe("Check-in commands", () => {
    it("parses a basic IN command", () => {
      expect(parseWhatsAppCommand("IN")).toEqual({
        type: "check_in",
      });
    });

    it("parses IN with a reason", () => {
      expect(
        parseWhatsAppCommand("IN reason: Traffic jam"),
      ).toEqual({
        type: "check_in",
        reason: "Traffic jam",
      });
    });

    it("supports case-insensitive check-in commands", () => {
      expect(
        parseWhatsAppCommand("in REASON: Traffic jam"),
      ).toEqual({
        type: "check_in",
        reason: "Traffic jam",
      });
    });

    it("trims unnecessary whitespace", () => {
      expect(
        parseWhatsAppCommand("  IN   reason:   Traffic jam  "),
      ).toEqual({
        type: "check_in",
        reason: "Traffic jam",
      });
    });
  });

  describe("Check-out commands", () => {
    it("parses a basic OUT command", () => {
      expect(parseWhatsAppCommand("OUT")).toEqual({
        type: "check_out",
      });
    });

    it("parses OUT with a note", () => {
      expect(
        parseWhatsAppCommand("OUT note: Personal work"),
      ).toEqual({
        type: "check_out",
        note: "Personal work",
      });
    });

    it("supports case-insensitive check-out commands", () => {
      expect(
        parseWhatsAppCommand("out NOTE: Personal work"),
      ).toEqual({
        type: "check_out",
        note: "Personal work",
      });
    });

    it("trims unnecessary whitespace", () => {
      expect(
        parseWhatsAppCommand("  OUT   note:   Personal work  "),
      ).toEqual({
        type: "check_out",
        note: "Personal work",
      });
    });
  });

  describe("Help command", () => {
    it("parses HELP", () => {
      expect(parseWhatsAppCommand("HELP")).toEqual({
        type: "help",
      });
    });

    it("supports lowercase help", () => {
      expect(parseWhatsAppCommand("help")).toEqual({
        type: "help",
      });
    });
  });

  describe("Invalid commands", () => {
    it("rejects empty messages", () => {
      expect(parseWhatsAppCommand("")).toEqual({
        type: "invalid",
      });
    });

    it("rejects whitespace-only messages", () => {
      expect(parseWhatsAppCommand("   ")).toEqual({
        type: "invalid",
      });
    });

    it("rejects unknown commands", () => {
      expect(parseWhatsAppCommand("Hello")).toEqual({
        type: "invalid",
      });
    });

    it("rejects IN with an unsupported argument", () => {
      expect(parseWhatsAppCommand("IN traffic")).toEqual({
        type: "invalid",
      });
    });

    it("rejects OUT with an unsupported argument", () => {
      expect(parseWhatsAppCommand("OUT personal work")).toEqual({
        type: "invalid",
      });
    });

    it("rejects an empty reason", () => {
      expect(parseWhatsAppCommand("IN reason:")).toEqual({
        type: "invalid",
      });
    });

    it("rejects an empty note", () => {
      expect(parseWhatsAppCommand("OUT note:")).toEqual({
        type: "invalid",
      });
    });

    it("rejects a reason on OUT", () => {
      expect(
        parseWhatsAppCommand("OUT reason: Traffic jam"),
      ).toEqual({
        type: "invalid",
      });
    });

    it("rejects a note on IN", () => {
      expect(
        parseWhatsAppCommand("IN note: Personal work"),
      ).toEqual({
        type: "invalid",
      });
    });

    it("rejects extra text after HELP", () => {
      expect(parseWhatsAppCommand("HELP please")).toEqual({
        type: "invalid",
      });
    });
  });
});
