import { Schema, model, type InferSchemaType } from "mongoose";

export const ADMIN_ROLES = ["super_admin", "manager"] as const;

const adminSchema = new Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      enum: ADMIN_ROLES,
      required: true,
      default: "manager"
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true
    }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "admins"
  }
);

export type Admin = InferSchemaType<typeof adminSchema>;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const AdminModel = model("Admin", adminSchema);