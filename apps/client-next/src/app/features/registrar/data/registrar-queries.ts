import {
  type CreateRegistrarConfigDto,
  registrarControllerCreateConfig,
  registrarControllerDeleteConfig,
  registrarControllerGetConfig,
  registrarControllerUpdateConfig,
  type RegistrarConfigResponseDto,
  type UpdateRegistrarConfigDto,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';
import { hasHttpStatus } from '../../../core/errors/error-message';

type Instance = string | undefined;
type Tenant = string | null | undefined;

export const registrarConfigKey = (instance: Instance, tenant: Tenant) =>
  ['registrar-config', instance, tenant] as const;

/**
 * The tenant's registrar configuration (`GET /api/registrar/config`), or `null` when none is
 * stored. Passwords and client secrets are never returned; `hasPassword` and `hasClientSecret`
 * say whether one is stored. Needs `registrar:manage`.
 */
export function registrarConfigQuery(instance: Instance, tenant: Tenant, enabled = true) {
  return queryOptions({
    queryKey: registrarConfigKey(instance, tenant),
    queryFn: async (): Promise<RegistrarConfigResponseDto | null> => {
      try {
        return (await registrarControllerGetConfig()).data;
      } catch (error) {
        if (hasHttpStatus(error, 404)) return null;
        throw error;
      }
    },
    enabled: !!instance && enabled,
    retry: false,
  });
}

/**
 * Stores a new configuration, replacing a stored one (`POST /api/registrar/config`). The backend
 * signs in to the registrar first and refuses credentials that do not work.
 */
export function createRegistrarConfigMutation() {
  return mutationOptions({
    mutationFn: async (body: CreateRegistrarConfigDto): Promise<RegistrarConfigResponseDto> =>
      (await registrarControllerCreateConfig({ body })).data,
  });
}

/** Changes the stored configuration (`PATCH /api/registrar/config`); credentials are checked again. */
export function updateRegistrarConfigMutation() {
  return mutationOptions({
    mutationFn: async (body: UpdateRegistrarConfigDto): Promise<RegistrarConfigResponseDto> =>
      (await registrarControllerUpdateConfig({ body })).data,
  });
}

/** Deletes the configuration and its stored secrets (`DELETE /api/registrar/config`). */
export function deleteRegistrarConfigMutation() {
  return mutationOptions({
    mutationFn: async (): Promise<void> => {
      await registrarControllerDeleteConfig();
    },
  });
}
