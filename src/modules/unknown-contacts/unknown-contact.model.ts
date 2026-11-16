
import { Schema, model, type InferSchemaType } from "mongoose";

const unknownContactSchema = new Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    attemptCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 3,
    },

    restrictedUntil: {
      type: Date,
      default: undefined,
    },

    lastMessageAt: {
      type: Date,
      default: undefined,
    },

    processedMessageIds: {
      type: [String],
      default: [],
    },

    revision: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "unknown_contacts",
  },
);

export type UnknownContact = InferSchemaType<
  typeof unknownContactSchema
>;

export const UnknownContactModel = model(
  "UnknownContact",
  unknownContactSchema,
);
