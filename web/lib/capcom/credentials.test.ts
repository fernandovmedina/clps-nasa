import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: Array<{ name: string; input: Record<string, unknown> }> = [];
let expiry = new Date('2026-11-15T12:15:00Z');

vi.mock('@aws-sdk/client-cognito-identity', () => {
  class GetIdCommand { constructor(public input: Record<string, unknown>) {} }
  class GetOpenIdTokenCommand { constructor(public input: Record<string, unknown>) {} }
  class CognitoIdentityClient {
    async send(command: GetIdCommand | GetOpenIdTokenCommand) {
      sent.push({ name: command.constructor.name, input: command.input });
      return command instanceof GetIdCommand ? { IdentityId: 'us-east-1:guest' } : { Token: 'open-id-token' };
    }
  }
  return { CognitoIdentityClient, GetIdCommand, GetOpenIdTokenCommand };
});

vi.mock('@aws-sdk/client-sts', () => {
  class AssumeRoleWithWebIdentityCommand { constructor(public input: Record<string, unknown>) {} }
  class STSClient {
    async send(command: AssumeRoleWithWebIdentityCommand) {
      sent.push({ name: 'AssumeRoleWithWebIdentity', input: command.input });
      return { Credentials: { AccessKeyId: 'key', SecretAccessKey: 'secret', SessionToken: 'token', Expiration: expiry } };
    }
  }
  return { STSClient, AssumeRoleWithWebIdentityCommand };
});

const { createGuestCredentialProvider } = await import('./credentials');

describe('guest credentials', () => {
  beforeEach(() => {
    sent.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
    expiry = new Date('2026-11-15T12:15:00Z');
  });

  it('uses the classic flow with a 15 minute role session and never the enhanced GetCredentialsForIdentity', async () => {
    const credentials = await createGuestCredentialProvider()();
    expect(sent.map((s) => s.name)).toEqual(['GetIdCommand', 'GetOpenIdTokenCommand', 'AssumeRoleWithWebIdentity']);
    expect(sent[0]!.input).toEqual({ IdentityPoolId: 'us-east-1:8515f71e-ac0d-4f69-ab50-f78515b1988f' });
    expect(sent[1]!.input).toEqual({ IdentityId: 'us-east-1:guest' });
    expect(sent[2]!.input).toMatchObject({
      RoleArn: 'arn:aws:iam::040396448313:role/touchdown-capcom-guest',
      WebIdentityToken: 'open-id-token',
      DurationSeconds: 900,
    });
    expect(credentials).toMatchObject({ accessKeyId: 'key', secretAccessKey: 'secret', sessionToken: 'token' });
    expect(sent.some((s) => s.name.includes('GetCredentialsForIdentity'))).toBe(false);
  });

  it('reuses valid credentials, refreshes them near expiry and renews on demand', async () => {
    const provider = createGuestCredentialProvider();
    await provider();
    await provider();
    expect(sent.filter((s) => s.name === 'AssumeRoleWithWebIdentity')).toHaveLength(1);

    vi.setSystemTime(new Date('2026-11-15T12:14:30Z'));
    await provider();
    expect(sent.filter((s) => s.name === 'AssumeRoleWithWebIdentity')).toHaveLength(2);

    vi.setSystemTime(new Date('2026-11-15T12:20:00Z'));
    expiry = new Date('2026-11-15T12:35:00Z');
    await provider();
    provider.invalidate();
    await provider();
    expect(sent.filter((s) => s.name === 'AssumeRoleWithWebIdentity')).toHaveLength(4);
    expect(sent.filter((s) => s.name === 'GetIdCommand')).toHaveLength(1);
  });
});
