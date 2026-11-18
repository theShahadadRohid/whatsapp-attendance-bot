
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock environment variables before importing the WhatsApp client.
vi.mock("../../src/config/env.js", () => ({
  env: {
    WHATSAPP_ACCESS_TOKEN: "test-access-token",
    WHATSAPP_PHONE_NUMBER_ID: "123456789",
    WHATSAPP_API_VERSION: "v27.0",
  },
}));

import { env } from "../../src/config/env.js";

import {
  sendWhatsAppTextMessage,
} from "../../src/modules/integrations/whatsapp/whatsapp.client.js";

describe("WhatsApp API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a text message successfully", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          messaging_product: "whatsapp",
          contacts: [
            {
              input: "8801712345678",
              wa_id: "8801712345678",
            },
          ],
          messages: [
            {
              id: "wamid.test123",
              message_status: "accepted",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWhatsAppTextMessage({
      to: "8801712345678",
      body: "Hello from attendance bot",
    });

    expect(result.messages[0]?.id).toBe("wamid.test123");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];

    expect(url).toBe(
      `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    );

    expect(options.method).toBe("POST");

    expect(options.headers).toEqual({
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    });

    expect(JSON.parse(options.body as string)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "8801712345678",
      type: "text",
      text: {
        preview_url: false,
        body: "Hello from attendance bot",
      },
    });
  });

  it("trims recipient and message body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [{ id: "wamid.trimmed" }],
        }),
        { status: 200 },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await sendWhatsAppTextMessage({
      to: "  8801712345678  ",
      body: "  Hello  ",
    });

    const [, options] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];

    const requestBody = JSON.parse(options.body as string);

    expect(requestBody.to).toBe("8801712345678");
    expect(requestBody.text.body).toBe("Hello");
  });

  it("supports previewUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [{ id: "wamid.preview" }],
        }),
        { status: 200 },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await sendWhatsAppTextMessage({
      to: "8801712345678",
      body: "https://example.com",
      previewUrl: true,
    });

    const [, options] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];

    const requestBody = JSON.parse(options.body as string);

    expect(requestBody.text.preview_url).toBe(true);
  });

  it("rejects an empty recipient", async () => {
    await expect(
      sendWhatsAppTextMessage({
        to: "   ",
        body: "Hello",
      }),
    ).rejects.toThrow(
      "WhatsApp recipient and message body are required.",
    );
  });

  it("rejects an empty message body", async () => {
    await expect(
      sendWhatsAppTextMessage({
        to: "8801712345678",
        body: "   ",
      }),
    ).rejects.toThrow(
      "WhatsApp recipient and message body are required.",
    );
  });

  it("handles Meta API errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "Invalid recipient",
            code: 100,
          },
        }),
        { status: 400 },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendWhatsAppTextMessage({
        to: "8801712345678",
        body: "Hello",
      }),
    ).rejects.toMatchObject({
      message: "Invalid recipient",
      statusCode: 400,
      errorCode: 100,
    });
  });

  it("handles network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        new Error("Network unavailable"),
      ),
    );

    await expect(
      sendWhatsAppTextMessage({
        to: "8801712345678",
        body: "Hello",
      }),
    ).rejects.toThrow(
      "Unable to connect to the WhatsApp API.",
    );
  });

  it("handles invalid JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Not JSON", { status: 200 }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendWhatsAppTextMessage({
        to: "8801712345678",
        body: "Hello",
      }),
    ).rejects.toThrow(
      "WhatsApp API returned an unexpected response.",
    );
  });

  it("handles successful responses without a message ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [],
        }),
        { status: 200 },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendWhatsAppTextMessage({
        to: "8801712345678",
        body: "Hello",
      }),
    ).rejects.toThrow(
      "WhatsApp API returned an unexpected response.",
    );
  });
});
