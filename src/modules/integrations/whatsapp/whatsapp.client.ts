import { env } from "../../../config/env.js";

export interface SendWhatsAppTextInput {
  to: string;
  body: string;
  previewUrl?: boolean;
}

export interface WhatsAppSendMessageResponse {
  messaging_product: "whatsapp";
  contacts?: Array<{
    input: string;
    wa_id?: string;
  }>;
  messages: Array<{
    id: string;
    message_status?: string;
  }>;
}

interface MetaErrorResponse {
  error?: {
    message?: string;
    code?: number;
    type?: string;
    fbtrace_id?: string;
  };
}

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly errorCode?: number,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function sendWhatsAppTextMessage(
  input: SendWhatsAppTextInput,
): Promise<WhatsAppSendMessageResponse> {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new WhatsAppApiError(
      "WhatsApp API credentials are not configured.",
    );
  }

  const to = input.to.trim();
  const body = input.body.trim();

  if (!to || !body) {
    throw new WhatsAppApiError(
      "WhatsApp recipient and message body are required.",
    );
  }

  const url =
    `https://graph.facebook.com/` +
    `${env.WHATSAPP_API_VERSION}/` +
    `${phoneNumberId}/messages`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: input.previewUrl ?? false,
          body,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new WhatsAppApiError(
      "Unable to connect to the WhatsApp API.",
    );
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = isRecord(payload)
      ? (payload as MetaErrorResponse).error
      : undefined;

    throw new WhatsAppApiError(
      error?.message ??
        `WhatsApp API request failed with status ${response.status}.`,
      response.status,
      error?.code,
    );
  }

  if (
    !isRecord(payload) ||
    !Array.isArray(payload.messages) ||
    typeof payload.messages[0]?.id !== "string"
  ) {
    throw new WhatsAppApiError(
      "WhatsApp API returned an unexpected response.",
      response.status,
    );
  }

  return payload as unknown as WhatsAppSendMessageResponse;
}
