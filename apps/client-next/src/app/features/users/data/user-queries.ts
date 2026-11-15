import {
  type CreateUserDto,
  type ManagedUserDto,
  type UpdateUserDto,
  userControllerCreateUser,
  userControllerDeleteUser,
  userControllerGetUser,
  userControllerGetUsers,
  userControllerUpdateUser,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

/**
 * The people of the tenant, managed in the identity provider (Keycloak). The backend answers 501
 * when it manages no people, as with built-in or generic sign-in. A new person gets a temporary
 * password, shown once.
 */

type Instance = string | undefined;
type Tenant = string | null | undefined;
export type User = ManagedUserDto;

export const usersKey = (instance: Instance, tenant: Tenant) =>
  ['users', instance, tenant] as const;

/** The tenant's people (`GET /api/user`). */
export function usersQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: usersKey(instance, tenant),
    queryFn: async (): Promise<User[]> => (await userControllerGetUsers()).data ?? [],
    enabled: !!instance,
  });
}

/** One person (`GET /api/user/{id}`). */
export function userQuery(instance: Instance, tenant: Tenant, id: string) {
  return queryOptions({
    queryKey: [...usersKey(instance, tenant), id] as const,
    queryFn: async (): Promise<User> => (await userControllerGetUser({ path: { id } })).data,
    enabled: !!instance && !!id,
  });
}

export function createUserMutation() {
  return mutationOptions({
    mutationFn: async (body: CreateUserDto): Promise<User> =>
      (await userControllerCreateUser({ body })).data,
  });
}

export function updateUserMutation() {
  return mutationOptions({
    mutationFn: async ({ id, body }: { id: string; body: UpdateUserDto }): Promise<User> =>
      (await userControllerUpdateUser({ path: { id }, body })).data as User,
  });
}

export function deleteUserMutation() {
  return mutationOptions({
    mutationFn: async (id: string): Promise<void> => {
      await userControllerDeleteUser({ path: { id } });
    },
  });
}
