
import { Schema, model, type InferSchemaType } from "mongoose";

export const WHATSAPP_MESSAGE_STATUSES = [
  "processing",
  "processed",
  "failed",
] as const;

const whatsappMessageSchema = new Schema(
  {
    messageId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },

    status: {
      type: String,
      enum: WHATSAPP_MESSAGE_STATUSES,
      required: true,
    },

    attemptCount: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },

    leaseToken: {
      type: String,
      default: undefined,
    },

    leaseUntil: {
      type: Date,
      default: undefined,
    },

    processedAt: {
      type: Date,
      default: undefined,
    },

    lastError: {
      type: String,
      maxlength: 1000,
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "whatsapp_messages",
  },
);

export type WhatsAppMessage = InferSchemaType<
  typeof whatsappMessageSchema
>;

export const WhatsAppMessageModel = model(
  "WhatsAppMessage",
  whatsappMessageSchema,
);
