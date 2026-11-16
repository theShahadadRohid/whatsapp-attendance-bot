
import { describe, expect, it } from "vitest";

import { parseWhatsAppMessages } from "../../src/modules/integrations/whatsapp/whatsapp.payload.js";

const textPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              phone_number_id: "123456789",
            },
            contacts: [
              {
                profile: {
                  name: "Shahadad",
                },
                wa_id: "8801712345678",
              },
            ],
            messages: [
              {
                from: "8801712345678",
                id: "wamid.test123",
                timestamp: "1763300000",
                type: "text",
                text: {
                  body: "Check in",
                },
              },
            ],
          },
        },
      ],
    },
  ],
};

describe("WhatsApp payload parser", () => {
  it("parses an incoming text message", () => {
    const result = parseWhatsAppMessages(textPayload);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      from: "8801712345678",
      messageId: "wamid.test123",
      timestamp: "1763300000",
      phoneNumberId: "123456789",
      contactName: "Shahadad",
      type: "text",
      text: "Check in",
    });
  });

  it("parses an incoming location message", () => {
    const payload = {
      ...textPayload,
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: {
                  phone_number_id: "123456789",
                },
                messages: [
                  {
                    from: "8801712345678",
                    id: "wamid.location123",
                    timestamp: "1763300000",
                    type: "location",
                    location: {
                      latitude: 23.8103,
                      longitude: 90.4125,
                      name: "Office",
                      address: "Dhaka",
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = parseWhatsAppMessages(payload);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      from: "8801712345678",
      messageId: "wamid.location123",
      timestamp: "1763300000",
      phoneNumberId: "123456789",
      type: "location",
      location: {
        latitude: 23.8103,
        longitude: 90.4125,
        name: "Office",
        address: "Dhaka",
      },
    });
  });

  it("ignores delivery status notifications", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                statuses: [
                  {
                    id: "wamid.test123",
                    status: "delivered",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    expect(parseWhatsAppMessages(payload)).toEqual([]);
  });

  it("ignores unrelated webhook events", () => {
    const payload = {
      object: "page",
      entry: [],
    };

    expect(parseWhatsAppMessages(payload)).toEqual([]);
  });

  it("returns an empty array for malformed payloads", () => {
    expect(parseWhatsAppMessages(null)).toEqual([]);
    expect(parseWhatsAppMessages({})).toEqual([]);
    expect(parseWhatsAppMessages("invalid")).toEqual([]);
  });

  it("ignores messages with missing required fields", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  {
                    from: "8801712345678",
                    type: "text",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    expect(parseWhatsAppMessages(payload)).toEqual([]);
  });

  it("ignores locations with invalid coordinates", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  {
                    from: "8801712345678",
                    id: "wamid.invalid",
                    timestamp: "1763300000",
                    type: "location",
                    location: {
                      latitude: 120,
                      longitude: 90,
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    expect(parseWhatsAppMessages(payload)).toEqual([]);
  });

  it("preserves unsupported message types", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  {
                    from: "8801712345678",
                    id: "wamid.image123",
                    timestamp: "1763300000",
                    type: "image",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = parseWhatsAppMessages(payload);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("unsupported");
  });
});
