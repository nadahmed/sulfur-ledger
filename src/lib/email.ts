import nodemailer from "nodemailer";
import { getOrganization, EmailSettings } from "./db/organizations";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Internal function to send email with provided settings
 */
async function sendRawEmail(settings: EmailSettings, options: SendEmailOptions) {
  if (settings.provider === "brevo") {
    if (!settings.apiKey) throw new Error("Brevo API key is missing");
    
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": settings.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: settings.senderEmail, name: settings.senderName },
        to: [{ email: options.to }],
        subject: options.subject,
        textContent: options.text,
        htmlContent: options.html,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Brevo Error: ${JSON.stringify(error)}`);
    }
  } else if (settings.provider === "smtp") {
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPass,
      },
      secure: settings.smtpPort === 465,
    });

    await transporter.sendMail({
      from: `"${settings.senderName}" <${settings.senderEmail}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  }
}

export function getSystemEmailSettings(): EmailSettings {
  return {
    provider: (process.env.SYSTEM_EMAIL_PROVIDER || "smtp") as "brevo" | "smtp",
    apiKey: process.env.SYSTEM_BREVO_API_KEY,
    smtpHost: process.env.SYSTEM_SMTP_HOST,
    smtpPort: parseInt(process.env.SYSTEM_SMTP_PORT || "587"),
    smtpUser: process.env.SYSTEM_SMTP_USER,
    smtpPass: process.env.SYSTEM_SMTP_PASS,
    senderEmail: process.env.SYSTEM_EMAIL_SENDER_EMAIL || "no-reply@sulfurbook.com",
    senderName: process.env.SYSTEM_EMAIL_SENDER_NAME || "Sulfur Book",
  };
}

export function getEffectiveEmailSettings(org: { emailSettings?: EmailSettings }): EmailSettings {
  const settings = org.emailSettings;

  if (!settings || settings.provider === "system") {
    return getSystemEmailSettings();
  }

  return settings;
}

export async function sendEmail(orgId: string, options: SendEmailOptions) {
  const org = await getOrganization(orgId);
  if (!org) {
    console.error(`[EMAIL ERROR] Organization ${orgId} not found`);
    return;
  }

  const settings = getEffectiveEmailSettings(org);
  
  // Prefix subject with organization name
  const orgName = org.name || "Sulfur Book";
  const prefixedSubject = `[${orgName}] ${options.subject}`;

  await sendRawEmail(settings, { 
    ...options, 
    subject: prefixedSubject 
  });
}

export async function testEmail(settings: EmailSettings, to: string) {
  const effectiveSettings = settings.provider === "system" ? getSystemEmailSettings() : settings;
  
  await sendRawEmail(effectiveSettings, {
    to,
    subject: "SMTP Setup Test Email",
    text: "Hello!\n\nThis is a test email from Sulfur Book to verify your SMTP settings.\n\nIf you received this, your configuration is working correctly.",
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #2563eb;">SMTP Setup Successful</h2>
        <p>This is a test email to verify your email delivery settings on <strong>Sulfur Book</strong>.</p>
        <p>Your configuration is working correctly.</p>
      </div>
    `
  });
}
