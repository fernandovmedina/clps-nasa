import {
  CAPCOM_CREDENTIAL_SECONDS,
  CAPCOM_GUEST_ROLE_ARN,
  CAPCOM_IDENTITY_POOL_ID,
  CAPCOM_REGION,
} from './config';
import type { CredentialsProvider, GuestCredentials } from './types';

export type GuestCredentialProvider = CredentialsProvider & { invalidate: () => void };

const REFRESH_MARGIN_MS = 60_000;

/**
 * Credenciales de invitado por el flujo clásico de Cognito: GetId, GetOpenIdToken
 * y STS AssumeRoleWithWebIdentity. El flujo mejorado (GetCredentialsForIdentity)
 * aplica una política de sesión sin Bedrock, así que nunca se llama.
 */
export function createGuestCredentialProvider(): GuestCredentialProvider {
  let identityId: string | null = null;
  let cached: GuestCredentials | null = null;
  let pending: Promise<GuestCredentials> | null = null;

  async function fetchCredentials(): Promise<GuestCredentials> {
    const [{ CognitoIdentityClient, GetIdCommand, GetOpenIdTokenCommand }, { STSClient, AssumeRoleWithWebIdentityCommand }] =
      await Promise.all([import('@aws-sdk/client-cognito-identity'), import('@aws-sdk/client-sts')]);

    const cognito = new CognitoIdentityClient({ region: CAPCOM_REGION });
    if (!identityId) {
      const id = await cognito.send(new GetIdCommand({ IdentityPoolId: CAPCOM_IDENTITY_POOL_ID }));
      if (!id.IdentityId) throw new Error('Cognito GetId returned no identity');
      identityId = id.IdentityId;
    }
    const token = await cognito.send(new GetOpenIdTokenCommand({ IdentityId: identityId }));
    if (!token.Token) throw new Error('Cognito GetOpenIdToken returned no token');

    const sts = new STSClient({ region: CAPCOM_REGION });
    const assumed = await sts.send(
      new AssumeRoleWithWebIdentityCommand({
        RoleArn: CAPCOM_GUEST_ROLE_ARN,
        RoleSessionName: `capcom-${Math.random().toString(36).slice(2, 10)}`,
        WebIdentityToken: token.Token,
        DurationSeconds: CAPCOM_CREDENTIAL_SECONDS,
      }),
    );
    const c = assumed.Credentials;
    if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken) {
      throw new Error('STS AssumeRoleWithWebIdentity returned no credentials');
    }
    return {
      accessKeyId: c.AccessKeyId,
      secretAccessKey: c.SecretAccessKey,
      sessionToken: c.SessionToken,
      expiration: c.Expiration,
    };
  }

  const provider: CredentialsProvider = async () => {
    if (cached?.expiration && cached.expiration.getTime() - Date.now() > REFRESH_MARGIN_MS) {
      return cached;
    }
    pending ??= fetchCredentials()
      .then((c) => {
        cached = c;
        return c;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
  return Object.assign(provider, {
    invalidate: () => {
      cached = null;
    },
  });
}
