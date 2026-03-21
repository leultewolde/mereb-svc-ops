import nodemailer from 'nodemailer';
import type { TransportOptions } from 'nodemailer';
import type { InviteEmailSenderPort } from '../../../application/ops/ports.js';
import type { InviteCode, InviteEmailDelivery } from '../../../domain/ops/runtime-config.js';

type InviteEmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  from: string;
  fromDisplayName: string | null;
  replyTo: string | null;
  replyToDisplayName: string | null;
  username: string;
  password: string;
  webShellOrigin: string;
};

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function parseBoolean(value: string | null): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function parsePort(value: string | null, secure: boolean): number {
  if (!value) {
    return secure ? 465 : 587;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`INVITE_EMAIL_SMTP_PORT must be a positive integer, received "${value}"`);
  }

  return parsed;
}

function formatMailboxAddress(name: string | null, email: string): string {
  return name ? `"${name.replace(/"/g, '\\"')}" <${email}>` : email;
}

function loadInviteEmailConfig(): InviteEmailConfig | null {
  const host = readEnv('INVITE_EMAIL_SMTP_HOST');
  const from = readEnv('INVITE_EMAIL_SMTP_FROM');
  const username = readEnv('INVITE_EMAIL_SMTP_USERNAME');
  const password = readEnv('INVITE_EMAIL_SMTP_PASSWORD');
  const webShellOrigin = readEnv('WEB_SHELL_ORIGIN');

  if (!host || !from || !username || !password || !webShellOrigin) {
    return null;
  }

  const secure = parseBoolean(readEnv('INVITE_EMAIL_SMTP_SSL'));
  return {
    host,
    port: parsePort(readEnv('INVITE_EMAIL_SMTP_PORT'), secure),
    secure,
    requireTls: parseBoolean(readEnv('INVITE_EMAIL_SMTP_STARTTLS')),
    from,
    fromDisplayName: readEnv('INVITE_EMAIL_SMTP_FROM_DISPLAY_NAME'),
    replyTo: readEnv('INVITE_EMAIL_SMTP_REPLY_TO'),
    replyToDisplayName: readEnv('INVITE_EMAIL_SMTP_REPLY_TO_DISPLAY_NAME'),
    username,
    password,
    webShellOrigin
  };
}

function buildRegisterUrl(webShellOrigin: string): string {
  return new URL('/register', webShellOrigin).toString();
}

function buildInviteEmailText(invite: InviteCode & { email: string }, registerUrl: string): string {
  return [
    'You have been invited to Mereb Social.',
    '',
    `Invite code: ${invite.code}`,
    `Reserved email: ${invite.email}`,
    invite.expiresAt ? `Expires at: ${invite.expiresAt}` : null,
    '',
    `Register here: ${registerUrl}`,
    '',
    'Open the registration page and enter the invite code to create your account.'
  ]
    .filter(Boolean)
    .join('\n');
}

function buildInviteEmailHtml(invite: InviteCode & { email: string }, registerUrl: string): string {
  const expiry = invite.expiresAt ? `<p><strong>Expires at:</strong> ${invite.expiresAt}</p>` : '';
  return [
    '<div style="font-family: sans-serif; line-height: 1.5;">',
    '<p>You have been invited to Mereb Social.</p>',
    `<p><strong>Invite code:</strong> ${invite.code}</p>`,
    `<p><strong>Reserved email:</strong> ${invite.email}</p>`,
    expiry,
    `<p><a href="${registerUrl}">Open the registration page</a> and enter the invite code to create your account.</p>`,
    '</div>'
  ].join('');
}

export class SmtpInviteEmailSenderAdapter implements InviteEmailSenderPort {
  async sendInviteCodeEmail(invite: InviteCode & { email: string }): Promise<InviteEmailDelivery> {
    const attemptedAt = new Date().toISOString();
    const config = loadInviteEmailConfig();
    if (!config) {
      return {
        delivered: false,
        recipient: invite.email,
        attemptedAt,
        error: 'Invite email delivery is not configured'
      };
    }

    const registerUrl = buildRegisterUrl(config.webShellOrigin);
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTls,
      auth: {
        user: config.username,
        pass: config.password
      }
    } as TransportOptions);

    await transport.sendMail({
      from: formatMailboxAddress(config.fromDisplayName, config.from),
      to: invite.email,
      replyTo: config.replyTo ? formatMailboxAddress(config.replyToDisplayName, config.replyTo) : undefined,
      subject: 'Your Mereb Social invite code',
      text: buildInviteEmailText(invite, registerUrl),
      html: buildInviteEmailHtml(invite, registerUrl)
    });

    return {
      delivered: true,
      recipient: invite.email,
      attemptedAt,
      error: null
    };
  }
}
