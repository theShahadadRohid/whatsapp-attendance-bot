
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
      type: "enroll";
      token: string;
    }
  | {
      type: "consent";
    }
  | {
      type: "stop";
    }
  | {
      type: "help";
    }
  | {
      type: "invalid";
    };

/**
 * Parses an incoming WhatsApp text message.
 *
 * Supported commands:
 * ENROLL <token>
 * YES
 * STOP
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

  const enrollmentMatch = normalizedMessage.match(
    /^ENROLL\s+([A-Za-z0-9_-]{20,})$/i,
  );

if (enrollmentMatch?.[1]) {
  return {
    type: "enroll",
    token: enrollmentMatch[1],
  };
}

  if (/^YES$/i.test(normalizedMessage)) {
    return { type: "consent" };
  }

  if (/^STOP$/i.test(normalizedMessage)) {
    return { type: "stop" };
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
