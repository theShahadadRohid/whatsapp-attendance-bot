import { Schema, model, type InferSchemaType } from "mongoose";

const passwordResetRequestSchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      unique: true,
    },

    status: {
      type: String,
      enum: ["pending", "processing", "resolved"],
      default: "pending",
      required: true,
    },

    requestedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },

    resolvedAt: {
      type: Date,
      default: undefined,
    },

    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "password_reset_requests",
  },
);

passwordResetRequestSchema.index({ status: 1, requestedAt: 1 });

export type PasswordResetRequest = InferSchemaType<
  typeof passwordResetRequestSchema
>;

export const PasswordResetRequestModel = model(
  "PasswordResetRequest",
  passwordResetRequestSchema,
);