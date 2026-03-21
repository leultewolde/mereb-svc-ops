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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInviteDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(parsed);
}

function buildInviteEmailText(invite: InviteCode & { email: string }, registerUrl: string): string {
  const formattedExpiry = formatInviteDate(invite.expiresAt);
  return [
    'You have been invited to Mereb Social.',
    '',
    'Use the code below to finish creating your account.',
    '',
    `Invite code: ${invite.code}`,
    `Reserved email: ${invite.email}`,
    formattedExpiry ? `Expires at: ${formattedExpiry}` : null,
    '',
    `Register here: ${registerUrl}`,
    '',
    'Open the registration page, enter the invite code, and complete your account details.',
    '',
    'If you were not expecting this invite, you can safely ignore this email.'
  ]
    .filter(Boolean)
    .join('\n');
}

function buildInviteEmailHtml(invite: InviteCode & { email: string }, registerUrl: string): string {
  const escapedCode = escapeHtml(invite.code);
  const escapedEmail = escapeHtml(invite.email);
  const escapedRegisterUrl = escapeHtml(registerUrl);
  const formattedExpiry = formatInviteDate(invite.expiresAt);
  const expiryMarkup = formattedExpiry
    ? [
        '<tr>',
        '  <td style="padding-top: 12px; font-size: 14px; color: #635b69;">Expires</td>',
        `  <td style="padding-top: 12px; font-size: 14px; color: #231f2b; font-weight: 600; text-align: right;">${escapeHtml(formattedExpiry)}</td>`,
        '</tr>'
      ].join('')
    : '';

  return [
    '<!doctype html>',
    '<html>',
    '  <body style="margin: 0; background: #fff8f9; color: #231f2b; font-family: Inter, Arial, sans-serif;">',
    '    <div style="padding: 32px 16px;">',
    '      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 640px; margin: 0 auto; border-collapse: collapse;">',
    '        <tr>',
    '          <td style="padding-bottom: 16px; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #ff355d; font-weight: 700;">Mereb Social</td>',
    '        </tr>',
    '        <tr>',
    '          <td style="background: #ffffff; border: 1px solid #ffd5dc; border-radius: 28px; box-shadow: 0 24px 48px rgba(255, 53, 93, 0.08); overflow: hidden;">',
    '            <div style="padding: 36px 36px 28px; background: linear-gradient(180deg, #fff7f8 0%, #ffffff 100%);">',
    '              <div style="display: inline-block; padding: 8px 14px; border-radius: 999px; background: #ffe5ea; color: #ff355d; font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;">Invite only</div>',
    '              <h1 style="margin: 20px 0 12px; font-size: 34px; line-height: 1.1; letter-spacing: -0.03em; color: #231f2b;">Your Mereb Social invite is ready</h1>',
    '              <p style="margin: 0; font-size: 16px; line-height: 1.7; color: #635b69;">Use the invite code below to create your account and join the platform through the normal Mereb sign-in flow.</p>',
    '            </div>',
    '            <div style="padding: 0 36px 36px;">',
    '              <div style="margin-top: 8px; padding: 24px; background: #fff4f6; border: 1px solid #ffdbe2; border-radius: 24px;">',
    '                <div style="font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #7d7382; font-weight: 700;">Invite code</div>',
    `                <div style="margin-top: 10px; font-size: 30px; line-height: 1; letter-spacing: 0.14em; font-weight: 800; color: #231f2b;">${escapedCode}</div>`,
    '                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top: 18px; border-collapse: collapse;">',
    '                  <tr>',
    '                    <td style="font-size: 14px; color: #635b69;">Reserved email</td>',
    `                    <td style="font-size: 14px; color: #231f2b; font-weight: 600; text-align: right;">${escapedEmail}</td>`,
    '                  </tr>',
    expiryMarkup,
    '                </table>',
    '              </div>',
    '              <div style="margin-top: 28px;">',
    `                <a href="${escapedRegisterUrl}" style="display: inline-block; padding: 16px 24px; border-radius: 999px; background: #ff355d; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">Open registration</a>`,
    '              </div>',
    `              <p style="margin: 20px 0 0; font-size: 14px; line-height: 1.7; color: #635b69;">If the button does not open, copy and paste this link into your browser:<br /><a href="${escapedRegisterUrl}" style="color: #ff355d; text-decoration: none;">${escapedRegisterUrl}</a></p>`,
    '              <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #f1d6dc;">',
    '                <p style="margin: 0; font-size: 13px; line-height: 1.7; color: #7d7382;">If you were not expecting this invite, you can safely ignore this email.</p>',
    '              </div>',
    '            </div>',
    '          </td>',
    '        </tr>',
    '      </table>',
    '    </div>',
    '  </body>',
    '</html>'
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
