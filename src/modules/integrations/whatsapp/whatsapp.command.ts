
export type WhatsAppCommand =
  | {
      type: "check_in";
      reason?: string;
    }
  | {
      type: "check_out";
      note?: string;
    }
  | {
      type: "help";
    }
  | {
      type: "invalid";
    };

/**
 * Parses an incoming WhatsApp text message into an attendance command.
 *
 * Supported commands:
 * IN
 * IN reason: Traffic jam
 * OUT
 * OUT note: Personal work
 * HELP
 */
export function parseWhatsAppCommand(
  message: string,
): WhatsAppCommand {
  const normalizedMessage = message.trim().replace(/\s+/g, " ");

  if (!normalizedMessage) {
    return { type: "invalid" };
  }

  if (/^HELP$/i.test(normalizedMessage)) {
    return { type: "help" };
  }

  const checkInMatch = normalizedMessage.match(
    /^IN(?:\s+reason\s*:\s*(.+))?$/i,
  );

  if (checkInMatch) {
    const reason = checkInMatch[1]?.trim();

    return reason
      ? { type: "check_in", reason }
      : { type: "check_in" };
  }

  const checkOutMatch = normalizedMessage.match(
    /^OUT(?:\s+note\s*:\s*(.+))?$/i,
  );

  if (checkOutMatch) {
    const note = checkOutMatch[1]?.trim();

    return note
      ? { type: "check_out", note }
      : { type: "check_out" };
  }

  return { type: "invalid" };
}
