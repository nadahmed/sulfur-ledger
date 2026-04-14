import { z } from "zod";

export const AccountSchema = z.object({
  name: z.string().min(1, "Account name is required").max(100),
  category: z.enum(["asset", "liability", "equity", "income", "expense"]),
});

export type AccountFormValues = z.infer<typeof AccountSchema>;

export const TagSchema = z.object({
  name: z.string().min(1, "Tag name is required").max(50),
  color: z.string().min(4, "Invalid color").max(20),
  description: z.string().max(200).optional(),
});

export type TagFormValues = z.infer<typeof TagSchema>;

export const JournalEntrySchema = z.object({
  date: z.string().min(1, "Date or ISO string is required"),
  description: z.string().min(1, "Description is required").max(200),
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  fromAccountId: z.string().min(1, "Credit account is required"),
  toAccountId: z.string().min(1, "Debit account is required"),
  tags: z.union([z.array(z.string()), z.string()]).optional().transform((val) => {
    if (typeof val === "string") {
      if (val.trim() === "") return [];
      return val.split(",").map(t => t.trim()).filter(Boolean);
    }
    return val || [];
  }),
  receipt: z.object({
    key: z.string(),
    provider: z.enum(["system", "s3", "cloudinary"]),
    contentType: z.string(),
  }).nullable().optional(),
}).refine((data) => data.fromAccountId !== data.toAccountId, {
  message: "From and To accounts cannot be the same",
  path: ["toAccountId"],
});

export type JournalEntryFormValues = z.infer<typeof JournalEntrySchema>;
export type JournalEntryFormInput = z.input<typeof JournalEntrySchema>;

export const OrganizationSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(100),
  currencySymbol: z.string().min(1, "Currency symbol is required").max(10),
  currencyPosition: z.enum(["prefix", "suffix"]),
  currencyHasSpace: z.boolean(),
  thousandSeparator: z.enum([",", ".", " ", "'", "none"]),
  decimalSeparator: z.enum([".", ","]),
  grouping: z.enum(["standard", "indian", "none"]),
  decimalPlaces: z.number().min(0).max(4),
  storageSettings: z.object({
    provider: z.enum(["system", "s3", "cloudinary"]),
    customFolder: z.string().optional(),
    s3: z.object({
      endpoint: z.string().min(1),
      region: z.string().min(1),
      accessKeyId: z.string().min(1),
      secretAccessKey: z.string().min(1),
      bucketName: z.string().min(1),
    }).optional(),
    cloudinary: z.object({
      cloudName: z.string().min(1),
      apiKey: z.string().min(1),
      apiSecret: z.string().min(1),
    }).optional(),
  }).optional(),
});

export type OrganizationFormValues = z.infer<typeof OrganizationSchema>;

export const InvitationSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["viewer", "member", "admin"]),
});

export type InvitationFormValues = z.infer<typeof InvitationSchema>;

export const EmailSettingsSchema = z.object({
  provider: z.enum(["system", "brevo", "smtp"]),
  senderEmail: z.string().email("Invalid sender email").or(z.literal("")),
  senderName: z.string().min(1, "Sender name is required"),
  apiKey: z.string().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
});

export type EmailSettingsFormValues = z.infer<typeof EmailSettingsSchema>;

export const McpSettingsSchema = z.object({
  mcpApiKey: z.string().optional(),
  mcpApiKeyExpiresAt: z.string().optional(),
  ttlDays: z.string().optional(), // "30", "60", "90", "never"
});

export type McpSettingsFormValues = z.infer<typeof McpSettingsSchema>;

export const RecurringEntrySchema = z.object({
  description: z.string().min(1, "Description is required").max(200),
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  fromAccountId: z.string().min(1, "Source account is required"),
  toAccountId: z.string().min(1, "Destination account is required"),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().min(1, "Interval must be at least 1"),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
  startDate: z.string().min(1, "Start date is required"),
  tags: z.union([z.array(z.string()), z.string()]).optional().transform((val) => {
    if (typeof val === "string") {
      if (val.trim() === "") return [];
      return val.split(",").map(t => t.trim()).filter(Boolean);
    }
    return val || [];
  }),
  isActive: z.boolean().default(true),
}).refine((data) => data.fromAccountId !== data.toAccountId, {
  message: "From and To accounts cannot be the same",
  path: ["toAccountId"],
});

export type RecurringEntryFormValues = z.infer<typeof RecurringEntrySchema>;
export type RecurringEntryFormInput = z.input<typeof RecurringEntrySchema>;

export const AiSettingsSchema = z.object({
  provider: z.enum(["system", "google", "openai", "openrouter"]),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  baseUrl: z.string().optional(),
  personality: z.string().optional(),
});

export type AiSettingsFormValues = z.infer<typeof AiSettingsSchema>;
export const ApiKeySchema = z.object({
  name: z.string().min(1, "Label is required").max(50),
  role: z.enum(["viewer", "member", "admin"]),
  ttlDays: z.enum(["7", "30", "90", "never"]),
});

export type ApiKeyFormValues = z.infer<typeof ApiKeySchema>;
