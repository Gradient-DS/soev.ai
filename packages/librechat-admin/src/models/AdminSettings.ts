import mongoose, { Schema, Document } from 'mongoose';

export type SettingScope = 'global' | 'role' | 'user' | 'group';
export type SettingSource = 'admin' | 'yaml' | 'env' | 'default';

export interface IAdminSettings extends Document {
  key: string;
  value: any;
  yamlDefault: any;
  source: SettingSource;
  scope: SettingScope;
  scopeId: string | null;
  updatedBy: string | null;
  updatedAt: Date;
  createdAt: Date;
}

const adminSettingsSchema = new Schema<IAdminSettings>(
  {
    key: {
      type: String,
      required: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
    yamlDefault: {
      type: Schema.Types.Mixed,
      default: null,
    },
    source: {
      type: String,
      enum: ['admin', 'yaml', 'env', 'default'],
      default: 'admin',
    },
    scope: {
      type: String,
      enum: ['global', 'role', 'user', 'group'],
      default: 'global',
    },
    scopeId: {
      type: String,
      default: null,
    },
    updatedBy: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient lookups and uniqueness per scope
adminSettingsSchema.index({ key: 1, scope: 1, scopeId: 1 }, { unique: true });

// Use existing connection from LibreChat
const AdminSettings =
  mongoose.models.AdminSettings ||
  mongoose.model<IAdminSettings>('AdminSettings', adminSettingsSchema);

export default AdminSettings;
