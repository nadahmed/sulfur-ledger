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

export async function sendEmail(orgId: string, options: SendEmailOptions) {
  const org = await getOrganization(orgId);
  if (!org || !org.emailSettings || org.emailSettings.provider === "none") {
    console.log(`[EMAIL MOCK] No email settings for org ${orgId}. Sending to ${options.to}: ${options.subject}`);
    return;
  }

  await sendRawEmail(org.emailSettings, options);
}

export async function testEmail(settings: EmailSettings, to: string) {
  await sendRawEmail(settings, {
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
