import { computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { credentialConfigsQuery } from '../../issuance/data/issuance-queries';
import { presentationConfigsQuery } from '../../presentation-configs/data/presentation-config-queries';
import { usersByEndpoint } from './webhook-endpoint-display';

/**
 * The configurations that use each webhook endpoint, as far as the caller can read them: credential
 * types need `issuance:manage`, presentation configurations a presentation role. `users` is
 * undefined while they load or when they could not be loaded; `partial` says that one kind cannot
 * be read at all, so an endpoint may be in use without the page knowing.
 */
export function injectEndpointUsers() {
  const instance = inject(SessionService).getBaseUrl();
  const caller = inject(CallerService).loadedCaller;
  const tenant = computed(() => caller()?.tenantId);
  const has = (...roles: string[]) => roles.some((role) => caller()?.roles.includes(role));
  const readsCredentials = computed(() => has('issuance:manage'));
  const readsPresentations = computed(() => has('presentation:manage', 'presentation:request'));

  const credentials = injectQuery(() =>
    credentialConfigsQuery(instance, tenant(), readsCredentials())
  );
  const presentations = injectQuery(() => ({
    ...presentationConfigsQuery(instance, tenant()),
    enabled: !!instance && readsPresentations(),
  }));

  return {
    users: computed(() => {
      const ready =
        (!readsCredentials() || credentials.isSuccess()) &&
        (!readsPresentations() || presentations.isSuccess());
      return ready ? usersByEndpoint(credentials.data(), presentations.data()) : undefined;
    }),
    partial: computed(() => !readsCredentials() || !readsPresentations()),
    failed: computed(() => credentials.isError() || presentations.isError()),
    retry: () => {
      if (credentials.isError()) void credentials.refetch();
      if (presentations.isError()) void presentations.refetch();
    },
  };
}
