import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

const sendMailMock = vi.hoisted(() => vi.fn());
const createTransportMock = vi.hoisted(() =>
  vi.fn(() => ({
    sendMail: sendMailMock
  }))
);

vi.mock('nodemailer', () => ({
  default: {
    createTransport: createTransportMock
  }
}));

import { SmtpInviteEmailSenderAdapter } from '../src/adapters/outbound/invites/smtp-invite-email-sender.js';

const envSnapshot = {
  INVITE_EMAIL_SMTP_HOST: process.env.INVITE_EMAIL_SMTP_HOST,
  INVITE_EMAIL_SMTP_PORT: process.env.INVITE_EMAIL_SMTP_PORT,
  INVITE_EMAIL_SMTP_SSL: process.env.INVITE_EMAIL_SMTP_SSL,
  INVITE_EMAIL_SMTP_STARTTLS: process.env.INVITE_EMAIL_SMTP_STARTTLS,
  INVITE_EMAIL_SMTP_FROM: process.env.INVITE_EMAIL_SMTP_FROM,
  INVITE_EMAIL_SMTP_FROM_DISPLAY_NAME: process.env.INVITE_EMAIL_SMTP_FROM_DISPLAY_NAME,
  INVITE_EMAIL_SMTP_REPLY_TO: process.env.INVITE_EMAIL_SMTP_REPLY_TO,
  INVITE_EMAIL_SMTP_REPLY_TO_DISPLAY_NAME: process.env.INVITE_EMAIL_SMTP_REPLY_TO_DISPLAY_NAME,
  INVITE_EMAIL_SMTP_USERNAME: process.env.INVITE_EMAIL_SMTP_USERNAME,
  INVITE_EMAIL_SMTP_PASSWORD: process.env.INVITE_EMAIL_SMTP_PASSWORD,
  WEB_SHELL_ORIGIN: process.env.WEB_SHELL_ORIGIN
};

beforeEach(() => {
  process.env.INVITE_EMAIL_SMTP_HOST = 'smtp.example.test';
  process.env.INVITE_EMAIL_SMTP_PORT = '587';
  process.env.INVITE_EMAIL_SMTP_SSL = 'false';
  process.env.INVITE_EMAIL_SMTP_STARTTLS = 'true';
  process.env.INVITE_EMAIL_SMTP_FROM = 'noreply@mereb.app';
  process.env.INVITE_EMAIL_SMTP_FROM_DISPLAY_NAME = 'Mereb Social';
  process.env.INVITE_EMAIL_SMTP_REPLY_TO = 'support@mereb.app';
  process.env.INVITE_EMAIL_SMTP_REPLY_TO_DISPLAY_NAME = 'Mereb Support';
  process.env.INVITE_EMAIL_SMTP_USERNAME = 'smtp-user';
  process.env.INVITE_EMAIL_SMTP_PASSWORD = 'smtp-pass';
  process.env.WEB_SHELL_ORIGIN = 'https://dev.mereb.app';
  sendMailMock.mockReset();
  createTransportMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();

  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test('renders a branded invite email with CTA, reserved email, and expiry details', async () => {
  sendMailMock.mockResolvedValueOnce({});

  const adapter = new SmtpInviteEmailSenderAdapter();
  const delivery = await adapter.sendInviteCodeEmail({
    code: 'TEST-2026-ABCD',
    email: 'test2026@mereb.app',
    label: 'Pilot',
    note: null,
    enabled: true,
    expiresAt: '2026-03-27T15:58:00.000Z',
    createdAt: '2026-03-21T15:58:00.000Z',
    createdBy: 'admin-1',
    redeemedAt: null,
    redeemedByUserId: null,
    redeemedEmail: null,
    redeemedDisplayName: null
  });

  assert.equal(delivery.delivered, true);
  assert.equal(delivery.recipient, 'test2026@mereb.app');
  assert.equal(createTransportMock.mock.calls.length, 1);

  const message = sendMailMock.mock.calls[0]?.[0] as Record<string, string | undefined>;
  assert.equal(message.subject, 'Your Mereb Social invite code');
  assert.equal(message.to, 'test2026@mereb.app');
  assert.match(String(message.text), /Use the code below to finish creating your account\./);
  assert.match(String(message.text), /Reserved email: test2026@mereb\.app/);
  assert.match(String(message.text), /Register here: https:\/\/dev\.mereb\.app\/register/);
  assert.match(String(message.html), /Your Mereb Social invite is ready/);
  assert.match(String(message.html), /Open registration/);
  assert.match(String(message.html), /Reserved email/);
  assert.match(String(message.html), /Expires/);
  assert.match(String(message.html), /https:\/\/dev\.mereb\.app\/register/);
});
