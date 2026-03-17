import { z } from "zod";

export const AccountSchema = z.object({
  name: z.string().min(1, "Account name is required").max(100),
  category: z.enum(["asset", "liability", "equity", "income", "expense"]),
});

export type AccountFormValues = z.infer<typeof AccountSchema>;

export const JournalEntrySchema = z.object({
  date: z.string().min(1, "Date is required"),
  description: z.string().min(1, "Description is required").max(200),
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  fromAccountId: z.string().min(1, "Credit account is required"),
  toAccountId: z.string().min(1, "Debit account is required"),
  notes: z.string().optional(),
}).refine((data) => data.fromAccountId !== data.toAccountId, {
  message: "From and To accounts cannot be the same",
  path: ["toAccountId"],
});

export type JournalEntryFormValues = z.infer<typeof JournalEntrySchema>;

export const OrganizationSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(100),
});

export type OrganizationFormValues = z.infer<typeof OrganizationSchema>;

export const InvitationSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["viewer", "member", "admin"]),
});

export type InvitationFormValues = z.infer<typeof InvitationSchema>;

export const EmailSettingsSchema = z.object({
  provider: z.enum(["none", "brevo", "smtp"]),
  senderEmail: z.string().email("Invalid sender email").or(z.literal("")),
  senderName: z.string().min(1, "Sender name is required"),
  apiKey: z.string().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
});

export type EmailSettingsFormValues = z.infer<typeof EmailSettingsSchema>;
