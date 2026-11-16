
export type WhatsAppMessageType = "text" | "location" | "unsupported";

export interface WhatsAppIncomingMessage {
  from: string;
  messageId: string;
  timestamp: string;
  type: WhatsAppMessageType;
  phoneNumberId?: string;
  contactName?: string;
  text?: string;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Extracts incoming WhatsApp messages from Meta's webhook payload.
 *
 * Status notifications and unrelated webhook events are ignored.
 * Unsupported message types are preserved as "unsupported".
 */
export function parseWhatsAppMessages(
  payload: unknown,
): WhatsAppIncomingMessage[] {
  if (
    !isRecord(payload) ||
    payload.object !== "whatsapp_business_account" ||
    !Array.isArray(payload.entry)
  ) {
    return [];
  }

  const incomingMessages: WhatsAppIncomingMessage[] = [];

  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) {
      continue;
    }

    for (const change of entry.changes) {
      if (
        !isRecord(change) ||
        change.field !== "messages" ||
        !isRecord(change.value)
      ) {
        continue;
      }

      const value = change.value;
      const metadata = isRecord(value.metadata)
        ? value.metadata
        : undefined;

      const phoneNumberId =
        metadata && isString(metadata.phone_number_id)
          ? metadata.phone_number_id
          : undefined;

      const contacts = Array.isArray(value.contacts)
        ? value.contacts
        : [];

      if (!Array.isArray(value.messages)) {
        continue;
      }

      for (const message of value.messages) {
        if (
          !isRecord(message) ||
          !isString(message.from) ||
          !isString(message.id) ||
          !isString(message.timestamp) ||
          !isString(message.type)
        ) {
          continue;
        }

        const contact = contacts.find(
          (item) =>
            isRecord(item) && item.wa_id === message.from,
        );

        const profile =
          isRecord(contact) && isRecord(contact.profile)
            ? contact.profile
            : undefined;

        const contactName =
          profile && isString(profile.name)
            ? profile.name
            : undefined;

        const commonFields = {
          from: message.from,
          messageId: message.id,
          timestamp: message.timestamp,
          ...(phoneNumberId ? { phoneNumberId } : {}),
          ...(contactName ? { contactName } : {}),
        };

        if (message.type === "text") {
          if (
            !isRecord(message.text) ||
            typeof message.text.body !== "string"
          ) {
            continue;
          }

          incomingMessages.push({
            ...commonFields,
            type: "text",
            text: message.text.body,
          });

          continue;
        }

        if (message.type === "location") {
          if (!isRecord(message.location)) {
            continue;
          }

          const { latitude, longitude } = message.location;

          if (
            typeof latitude !== "number" ||
            !Number.isFinite(latitude) ||
            latitude < -90 ||
            latitude > 90 ||
            typeof longitude !== "number" ||
            !Number.isFinite(longitude) ||
            longitude < -180 ||
            longitude > 180
          ) {
            continue;
          }

          const location = {
            latitude,
            longitude,
            ...(isString(message.location.name)
              ? { name: message.location.name }
              : {}),
            ...(isString(message.location.address)
              ? { address: message.location.address }
              : {}),
          };

          incomingMessages.push({
            ...commonFields,
            type: "location",
            location,
          });

          continue;
        }

        incomingMessages.push({
          ...commonFields,
          type: "unsupported",
        });
      }
    }
  }

  return incomingMessages;
}
