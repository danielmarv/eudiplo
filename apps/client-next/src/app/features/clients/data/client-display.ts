import type { ClientEntity } from '@eudiplo/sdk-core';
import { ROLE_ORDER } from '../../../core/auth/role-descriptions';
import type { Role } from '../../../core/auth/role-grants';

/** Why the caller cannot change a client whose roles it neither holds nor may grant. */
export const ROLE_LOCK = 'This client has roles you neither hold nor may grant.';

/** A client's roles in the order of the role groups. */
export function sortedRoles(client: Pick<ClientEntity, 'roles'>): string[] {
  const order = (role: string) => {
    const index = ROLE_ORDER.indexOf(role as Role);
    return index === -1 ? ROLE_ORDER.length : index;
  };
  return [...(client.roles ?? [])].sort((a, b) => order(a) - order(b));
}
