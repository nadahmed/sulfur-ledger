import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { ManagementClient } from 'auth0';

export const auth0 = new Auth0Client();

const management = new ManagementClient({
  domain: process.env.AUTH0_DOMAIN || '',
  clientId: process.env.AUTH0_CLIENT_ID || '',
  clientSecret: process.env.AUTH0_CLIENT_SECRET || '',
});

/**
 * Finds all Auth0 users with the specified email and links any secondary
 * accounts (e.g. Google OAuth) to the primary account (e.g. DB connection).
 * Returns the list of users found for this email.
 */
export async function linkUsersByEmail(email: string): Promise<any[] | undefined> {
  try {
    const res = await management.users.listUsersByEmail({ email });
    const users = res as any[];

    // If there is only one user or none, there's nothing to link
    if (!users || users.length <= 1) {
      return users;
    }

    // Determine the primary user account.
    // Preferably, pick the one with a database connection (auth0) first.
    // If none has provider 'auth0', just pick the first one as primary.
    const primaryUser = users.find((u: any) => u.identities?.[0]?.provider === 'auth0') || users[0];
    const secondaryUsers = users.filter((u: any) => u.user_id !== primaryUser.user_id);

    const primaryUserId = primaryUser.user_id;
    if (!primaryUserId) return users;

    for (const secondary of secondaryUsers) {
      // Find the main identity of the secondary account
      if (!secondary.identities || secondary.identities.length === 0) continue;
      
      const provider = secondary.identities[0].provider;
      const secondaryUserId = secondary.user_id;

      if (!secondaryUserId || !provider) continue;

      try {
        await management.users.identities.link(
          primaryUserId,
          {
            provider,
            user_id: secondaryUserId
          }
        );
        console.log(`Linked user ${secondaryUserId} to primary ${primaryUserId}`);
      } catch (linkError) {
        console.error(`Failed to link ${secondaryUserId} to ${primaryUserId}:`, linkError);
      }
    }
    
    return users;
  } catch (err) {
    console.error(`Error searching or linking users for email ${email}:`, err);
    return undefined;
  }
}