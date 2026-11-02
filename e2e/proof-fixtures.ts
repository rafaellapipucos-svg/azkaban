// What the proof tests share: the steps of the screens, and a way to send and review a proof through the
// same database functions the Edge Functions and the app call, without a camera, to reach a state fast.
// All of it against the local stack only (`pnpm db:start`). `proof-capture.spec.ts` is the real road.
//
// The keys and the JWT secret come from proof-kit, and are the universal demo values of every local
// Supabase stack, not secrets. People are minted a token instead of signing in, which keeps these
// helpers out of the sign-in rate limit of Auth (30 per 5 minutes per IP) that the screens use.
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { expect, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { admin, ANON, API, options } from '../supabase/functions/_shared/proof-kit';

const JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
// `proofRules.consentVersion` of @azkaban/config.
const CONSENT_VERSION = 1;

export const PHOTO = 'Pedir uma foto para concluir';
export const APPROVAL = 'Um administrador aprova a foto';

export const newUser = (name: string) => ({
  name,
  email: `${name.toLowerCase()}-${randomUUID()}@example.com`,
  password: randomUUID(),
});
export type User = ReturnType<typeof newUser>;

// Titles are looked up in the database, so each test makes its own.
export const uniqueTitle = (base: string) => `${base} ${randomUUID().slice(0, 6)}`;

export const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('visible=true');
export const text = (page: Page, value: string) =>
  page.getByText(value, { exact: true }).locator('visible=true');
export const contains = (page: Page, value: string | RegExp) =>
  page.getByText(value).locator('visible=true');
export const check = (page: Page, title: string, status: string) =>
  page.getByRole('checkbox', { name: `${title}: ${status}` });

export async function signUp(page: Page, user: User) {
  await page.goto('/sign-up');
  await page.getByLabel('Seu nome').fill(user.name);
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await button(page, 'Criar conta').first().click();
}

export async function signUpWithContext(page: Page, name: string, context = 'Casa') {
  await signUp(page, newUser(name));
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill(context);
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

export async function newContext(page: Page, name: string, group: string) {
  await page.goto('/contexts/new');
  await page.getByLabel('Nome', { exact: true }).fill(name);
  await page.getByRole('radio', { name: group }).click();
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

/** A group owner and a member, both signed in, and a group context for the owner's tasks. */
export async function groupWithMember(browser: Browser) {
  const owner = newUser('Dona');
  const member = newUser('Duda');
  const ownerPage = await (await browser.newContext()).newPage();
  const memberPage = await (await browser.newContext()).newPage();

  await signUp(ownerPage, owner);
  await expect(ownerPage.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  await ownerPage.goto('/groups/new');
  await ownerPage.getByLabel('Nome do grupo').fill('Equipe P');
  await button(ownerPage, 'Criar grupo').click();
  await button(ownerPage, 'Convidar membro').click();
  const code = await ownerPage.getByRole('heading', { name: /^[A-Z2-9]{10}$/ }).innerText();
  await newContext(ownerPage, 'Escritório', 'Equipe P');

  await memberPage.goto(`/join/${code}`);
  await button(memberPage, 'Entrar').click();
  await button(memberPage, 'Criar conta').click();
  await memberPage.getByLabel('Seu nome').fill(member.name);
  await memberPage.getByLabel('E-mail', { exact: true }).fill(member.email);
  await memberPage.getByLabel('Senha').fill(member.password);
  await button(memberPage, 'Criar conta').first().click();
  await button(memberPage, 'Aceitar').click();
  await expect(memberPage.getByText('Dona')).toBeVisible();
  return { ownerPage, memberPage };
}

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A client that acts as `userId`, without signing in. */
export function clientOf(userId: string): SupabaseClient {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + 3600,
  });
  const signature = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return createClient(API, ANON, {
    ...options,
    global: { headers: { Authorization: `Bearer ${head}.${body}.${signature}` } },
  });
}

export type Spot = {
  taskId: string;
  occurrenceId: string;
  groupId: string | null;
  createdBy: string;
  assigneeId: string;
};

/** The task a screen created, found by its title (give each test a title of its own). */
export async function spotOf(title: string): Promise<Spot> {
  const task = await admin
    .from('tasks')
    .select('id, group_id, created_by, assignee_id')
    .eq('title', title)
    .single();
  assert.ifError(task.error);
  const occurrence = await admin
    .from('task_occurrences')
    .select('id')
    .eq('task_id', task.data!.id)
    .single();
  assert.ifError(occurrence.error);
  return {
    taskId: task.data!.id,
    occurrenceId: occurrence.data!.id,
    groupId: task.data!.group_id,
    createdBy: task.data!.created_by,
    assigneeId: task.data!.assignee_id,
  };
}

/**
 * What `proof-validate` does once the photo has passed: issue a challenge as the author, claim it,
 * and commit. No bytes are stored. Returns the proof's id.
 */
export async function sendProof(occurrenceId: string, authorId: string): Promise<string> {
  const author = clientOf(authorId);
  const consent = await author.rpc('record_proof_consent', { p_version: CONSENT_VERSION });
  assert.ifError(consent.error);
  const challenge = await author.rpc('issue_proof_challenge', { p_occurrence_id: occurrenceId });
  assert.ifError(challenge.error);
  const nonce: string = challenge.data.nonce;
  const claimed = await admin.rpc('claim_proof_challenge', { p_nonce: nonce, p_user_id: authorId });
  assert.ifError(claimed.error);
  const committed = await admin.rpc('commit_proof', {
    p_nonce: nonce,
    p_user_id: authorId,
    p_storage_path: `${occurrenceId}/${nonce}.jpg`,
    p_sha256: randomBytes(32).toString('hex'),
    p_size_bytes: 1000,
    p_width_px: 640,
    p_height_px: 480,
    p_captured_at_device: new Date().toISOString(),
    p_distance_m: null,
    p_accuracy_m: null,
    p_flags: [],
    p_platform: 'web',
    p_app_version: 'e2e',
    p_user_agent: 'e2e',
  });
  assert.ifError(committed.error);
  return committed.data.proofId;
}

/** What the admin's review screen will call (`review_proof`). */
export async function reviewProof(
  reviewerId: string,
  proofId: string,
  decision: { approve: true } | { dispute: 'partial' | 'missed'; note: string },
) {
  const { error } = await clientOf(reviewerId).rpc('review_proof', {
    p_proof_id: proofId,
    p_decision: 'approve' in decision ? 'approve' : 'dispute',
    p_to_status: 'approve' in decision ? null : decision.dispute,
    p_note: 'approve' in decision ? null : decision.note,
  });
  assert.ifError(error);
}

export async function currentProofId(occurrenceId: string): Promise<string> {
  const { data, error } = await admin
    .from('task_occurrences')
    .select('current_proof_id')
    .eq('id', occurrenceId)
    .single();
  assert.ifError(error);
  return data!.current_proof_id;
}
