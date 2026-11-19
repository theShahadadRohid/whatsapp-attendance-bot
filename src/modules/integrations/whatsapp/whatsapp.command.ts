
export type WhatsAppCommand =
  | { type: "check_in" }
  | { type: "check_out" }
  | { type: "help" }
  | { type: "invalid" };

export function parseWhatsAppCommand(text: string): WhatsAppCommand {
  const command = text.trim().toUpperCase();

  if (command === "IN") {
    return { type: "check_in" };
  }

  if (command === "OUT") {
    return { type: "check_out" };
  }

  if (command === "HELP") {
    return { type: "help" };
  }

  return { type: "invalid" };
}
