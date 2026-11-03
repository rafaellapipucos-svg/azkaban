import { describe, expect, it } from 'vitest';
import {
  dailySummaryPreferencesSchema,
  dailySummaryRenderSchema,
  dailySummarySourceSchema,
  phoneCodeSchema,
  phoneE164Schema,
  phoneVerificationConfirmResultSchema,
  whatsappOutboundSchema,
  whatsappSendResultSchema,
  whatsappSignatureSchema,
  whatsappTextParamSchema,
  whatsappWebhookMessageSchema,
  whatsappWebhookSchema,
  whatsappWebhookStatusSchema,
} from './whatsapp';

const id = '11111111-1111-4111-8111-111111111111';
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('phoneE164Schema', () => {
  it.each(['+5511987654321', '+551133334444', '+14155552671', '+491234567'])('takes %s', (p) => {
    expect(ok(phoneE164Schema, p)).toBe(true);
  });

  it.each([
    '5511987654321',
    '+55 11 98765-4321',
    '+5511987654321 ',
    '+0511987654321',
    '+1234567',
    '+1234567890123456',
    '+55119876543a1',
    '+5511987654321\n',
    '',
  ])('refuses %j', (p) => {
    expect(ok(phoneE164Schema, p)).toBe(false);
  });
});

describe('phoneCodeSchema', () => {
  it('takes digits only', () => {
    expect(ok(phoneCodeSchema, '012345')).toBe(true);
    expect(ok(phoneCodeSchema, '12 345')).toBe(false);
    expect(ok(phoneCodeSchema, '１２３４５６')).toBe(false);
  });
});

describe('phoneVerificationConfirmResultSchema', () => {
  it('takes the verified phone or one of the two errors', () => {
    const verified = { phoneE164: '+5511987654321', verifiedAt: '2026-11-03T11:00:00+00:00' };
    expect(ok(phoneVerificationConfirmResultSchema, verified)).toBe(true);
    expect(ok(phoneVerificationConfirmResultSchema, { error: 'phone_code_invalid' })).toBe(true);
    expect(ok(phoneVerificationConfirmResultSchema, { error: 'phone_rate_limited' })).toBe(false);
  });
});

describe('whatsappTextParamSchema', () => {
  it.each(['Reunião às 09:00', 'a    b', 'Trabalho › Escritório: 09:00 Reunião; 14:00 Relatório'])(
    'takes %j',
    (value) => {
      expect(ok(whatsappTextParamSchema, value)).toBe(true);
    },
  );

  // Meta refuses these in a parameter; the template carries the line breaks.
  it.each(['a\nb', 'a\r\nb', 'a\tb', 'a     b', 'a b', 'a\u0000b', '', '   ', 'x'.repeat(1025)])(
    'refuses %j',
    (value) => {
      expect(ok(whatsappTextParamSchema, value)).toBe(false);
    },
  );

  // A title from someone else could reverse what the reader sees, from our number (SEG5-6).
  it.each(['fatura‮fdp.exe‬', 'a⁦b⁩'])('refuses the bidi control in %j', (value) => {
    expect(ok(whatsappTextParamSchema, value)).toBe(false);
  });
});

describe('dailySummaryPreferencesSchema', () => {
  const prefs = {
    enabled: true,
    time: '08:00',
    includeOverdue: true,
    deadlineDays: 7,
    skipEmpty: true,
  };
  it('takes the defaults and refuses out-of-range days', () => {
    expect(ok(dailySummaryPreferencesSchema, prefs)).toBe(true);
    expect(ok(dailySummaryPreferencesSchema, { ...prefs, deadlineDays: 31 })).toBe(false);
    expect(ok(dailySummaryPreferencesSchema, { ...prefs, time: '8:00' })).toBe(false);
  });
});

describe('dailySummarySourceSchema', () => {
  const task = {
    occurrenceId: id,
    title: 'Relatório',
    areaI18nKey: 'areas.work',
    contextName: 'Escritório',
    scheduleType: 'deadline',
    startAt: '2026-11-03T03:00:00+00:00',
    dueAt: '2026-11-07T20:00:00+00:00',
  };
  const source = {
    localDate: '2026-11-03',
    timezone: 'America/Sao_Paulo',
    today: [],
    overdue: null,
    deadlines: [task],
    deadlineDays: 7,
    totals: { today: 0, overdue: 0, deadlines: 1 },
    streak: null,
  };

  it('takes a day before Phase 6, with overdue turned off', () => {
    expect(ok(dailySummarySourceSchema, source)).toBe(true);
  });

  it('refuses an unknown time zone', () => {
    expect(ok(dailySummarySourceSchema, { ...source, timezone: 'Mars/Base' })).toBe(false);
  });
});

describe('dailySummaryRenderSchema', () => {
  const render = {
    date: 'terça, 3 de nov.',
    today: 'Nada marcado',
    overdue: 'Nenhuma',
    deadlines: 'Relatório, sexta (em 4 dias)',
    footer: 'Bom dia!',
  };
  it('takes one-line parameters and refuses a line break in any', () => {
    expect(ok(dailySummaryRenderSchema, render)).toBe(true);
    expect(ok(dailySummaryRenderSchema, { ...render, today: 'a\nb' })).toBe(false);
  });
});

describe('whatsappOutboundSchema', () => {
  const to = '+5511987654321';
  it('takes a template, a code and a reply', () => {
    expect(
      ok(whatsappOutboundSchema, {
        kind: 'template',
        to,
        template: 'daily_summary_v1',
        language: 'pt_BR',
        params: { date: 'terça', today: 'Nada' },
      }),
    ).toBe(true);
    expect(
      ok(whatsappOutboundSchema, {
        kind: 'code',
        to,
        template: 'phone_code_v1',
        language: 'pt_BR',
        code: '123456',
      }),
    ).toBe(true);
    expect(ok(whatsappOutboundSchema, { kind: 'text', to, text: 'Pronto.\nAté mais.' })).toBe(true);
  });

  it('refuses a bad template name, language or parameter name', () => {
    const base = { kind: 'template', to, template: 'daily_summary_v1', language: 'pt_BR' };
    expect(ok(whatsappOutboundSchema, { ...base, template: 'Daily', params: {} })).toBe(false);
    expect(ok(whatsappOutboundSchema, { ...base, language: 'pt-BR', params: {} })).toBe(false);
    expect(ok(whatsappOutboundSchema, { ...base, params: { 'Bad-Name': 'x' } })).toBe(false);
  });
});

describe('whatsappSendResultSchema', () => {
  it('takes the three results and refuses a provider message as a code', () => {
    expect(
      ok(whatsappSendResultSchema, { kind: 'accepted', providerMessageId: 'wamid.X', waId: null }),
    ).toBe(true);
    expect(ok(whatsappSendResultSchema, { kind: 'retry', code: 'wa_130429' })).toBe(true);
    expect(ok(whatsappSendResultSchema, { kind: 'failed', code: 'Recipient is not valid' })).toBe(
      false,
    );
  });
});

describe('whatsappSignatureSchema', () => {
  const hex = 'b63bb356dff0f1c24379efea2d6ef0b2e2040853339d1bcf13f9018790b1f7d2';
  it('takes sha256= and 64 lowercase hex digits only', () => {
    expect(ok(whatsappSignatureSchema, `sha256=${hex}`)).toBe(true);
    expect(ok(whatsappSignatureSchema, hex)).toBe(false);
    expect(ok(whatsappSignatureSchema, `sha1=${hex.slice(0, 40)}`)).toBe(false);
    expect(ok(whatsappSignatureSchema, `sha256=${hex.slice(1)}`)).toBe(false);
    expect(ok(whatsappSignatureSchema, `sha256=${hex}0`)).toBe(false);
  });
});

describe('whatsappWebhookSchema', () => {
  const value = {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: '15550783881', phone_number_id: '106540352242922' },
    statuses: [
      {
        id: 'wamid.A',
        status: 'failed',
        timestamp: '1762171200',
        recipient_id: '5511987654321',
        errors: [{ code: 131026, title: 'Message undeliverable' }],
      },
    ],
    messages: [
      { from: '5511987654321', id: 'wamid.B', type: 'text', text: { body: 'PARAR' } },
      { from: '5511987654321', id: 'wamid.C', type: 'button', button: { text: 'Parar' } },
    ],
  };
  const body = {
    object: 'whatsapp_business_account',
    entry: [{ id: '1', changes: [{ field: 'messages', value }] }],
  };

  it('reads statuses and messages one by one and drops what it does not use', () => {
    const parsed = whatsappWebhookSchema.parse(body);
    const change = parsed.entry[0]!.changes[0]!.value;
    expect(whatsappWebhookStatusSchema.parse(change.statuses?.[0]).errors).toEqual([
      { code: 131026 },
    ]);
    expect(whatsappWebhookMessageSchema.parse(change.messages?.[1]).button?.text).toBe('Parar');
    expect(change).not.toHaveProperty('messaging_product');
  });

  // One element out of shape must not drop a signed batch with a stop word in it (SEG5-3).
  it('keeps the batch when one element is out of shape', () => {
    const statuses = [{ id: 'x'.repeat(129), status: 'sent' }, ...value.statuses];
    const parsed = whatsappWebhookSchema.parse({
      ...body,
      entry: [{ changes: [{ field: 'messages', value: { ...value, statuses } }] }],
    });
    const read = parsed.entry[0]!.changes[0]!.value.statuses!;
    expect(read.map((s) => whatsappWebhookStatusSchema.safeParse(s).success)).toEqual([
      false,
      true,
    ]);
  });

  it('refuses another object', () => {
    expect(ok(whatsappWebhookSchema, { ...body, object: 'page' })).toBe(false);
  });
});
