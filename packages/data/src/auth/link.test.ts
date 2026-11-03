import { describe, expect, it } from 'vitest';
import { parseSessionLink } from './link';

const root = 'azkaban:///';
const tokens =
  'access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=magiclink';

describe('parseSessionLink', () => {
  it('reads both tokens and the path of a link of the app', () => {
    expect(parseSessionLink(`${root}tasks?tab=today#${tokens}`, root)).toEqual({
      kind: 'session',
      accessToken: 'a.b.c',
      refreshToken: 'r1',
      path: '/tasks',
    });
    expect(parseSessionLink(`${root}#${tokens}`, root)).toMatchObject({ path: '/' });
  });

  it('is not a sign-in link without both tokens', () => {
    expect(parseSessionLink(`${root}tasks`, root)).toBeNull();
    expect(parseSessionLink(`${root}tasks#`, root)).toBeNull();
    expect(parseSessionLink(`${root}tasks#access_token=a.b.c`, root)).toBeNull();
    expect(parseSessionLink(`${root}tasks#refresh_token=r1`, root)).toBeNull();
    expect(parseSessionLink(`${root}tasks?access_token=a&refresh_token=r`, root)).toBeNull();
  });

  it('ignores another scheme or host, even with tokens', () => {
    for (const url of [
      `https://evil.com/#${tokens}`,
      `evil:///tasks#${tokens}`,
      `azkaban://evil.com/#${tokens}`,
      `azkabanx:///#${tokens}`,
    ]) {
      expect(parseSessionLink(url, root)).toBeNull();
    }
  });

  it('never points outside the app', () => {
    for (const url of [`${root}/evil.com#${tokens}`, `${root}\\evil.com#${tokens}`]) {
      expect(parseSessionLink(url, root)).toMatchObject({ kind: 'session', path: '/' });
    }
  });

  it('carries the description of an expired link', () => {
    const expired = `${root}sign-in#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`;
    expect(parseSessionLink(expired, root)).toEqual({
      kind: 'error',
      description: 'Email link is invalid or has expired',
      path: '/sign-in',
    });
    expect(parseSessionLink(`${root}?error_description=gone`, root)).toMatchObject({
      kind: 'error',
      description: 'gone',
    });
  });

  // The regression of BL-38: `createAppLink('/')` on the web is the origin with no trailing slash.
  it('reads the link on the web, whose root has no trailing slash', () => {
    const web = 'http://localhost:8091';
    expect(parseSessionLink(`${web}/#${tokens}`, web)).toMatchObject({
      kind: 'session',
      path: '/',
    });
    expect(parseSessionLink(`${web}/groups#${tokens}`, web)).toMatchObject({ path: '/groups' });
    expect(parseSessionLink(`${web}.evil.com/#${tokens}`, web)).toBeNull();
    expect(parseSessionLink(`${web}0/#${tokens}`, web)).toBeNull();
  });

  it('works under the Expo Go root too', () => {
    const go = 'exp://192.168.0.2:8081/--/';
    expect(parseSessionLink(`${go}groups#${tokens}`, go)).toMatchObject({ path: '/groups' });
  });
});
