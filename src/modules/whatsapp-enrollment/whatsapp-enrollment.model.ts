
import { Schema, model, type InferSchemaType } from "mongoose";

export const WHATSAPP_ENROLLMENT_STATUSES = [
  "pending",
  "verified",
  "enrolled",
  "expired",
  "revoked",
] as const;

const whatsappEnrollmentSchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      unique: true,
    },

    tokenHash: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: WHATSAPP_ENROLLMENT_STATUSES,
      default: "pending",
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    attemptCount: {
      type: Number,
      default: 0,
      required: true,
      min: 0,
    },

    verifiedAt: {
      type: Date,
      default: undefined,
    },

    verifiedPhoneNumber: {
      type: String,
      default: undefined,
    },

    verifiedBsuid: {
      type: String,
      default: undefined,
    },

    consentedAt: {
      type: Date,
      default: undefined,
    },

    consentVersion: {
      type: String,
      default: undefined,
    },

    revokedAt: {
      type: Date,
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "whatsapp_enrollments",
  },
);

whatsappEnrollmentSchema.index(
  { tokenHash: 1 },
  { unique: true },
);

whatsappEnrollmentSchema.index({
  status: 1,
  expiresAt: 1,
});

export type WhatsAppEnrollment = InferSchemaType<
  typeof whatsappEnrollmentSchema
>;

export const WhatsAppEnrollmentModel = model(
  "WhatsAppEnrollment",
  whatsappEnrollmentSchema,
);
