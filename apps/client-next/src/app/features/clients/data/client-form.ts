import {
  type AbstractControl,
  FormControl,
  FormGroup,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import type { ClientEntity, CreateClientDto, UpdateClientDto } from '@eudiplo/sdk-core';
import type { Role } from '../../../core/auth/role-grants';

/** The characters a client ID may hold, as the backend accepts them. */
const CLIENT_ID = /^[A-Za-z0-9._:-]+$/;

function clientIdValidator(control: AbstractControl): ValidationErrors | null {
  const value = `${control.value ?? ''}`.trim();
  return !value || CLIENT_ID.test(value) ? null : { clientId: true };
}

/** The configurations a client can be limited to. */
export type ConfigSource = 'presentation' | 'issuance';

export const CONFIG_SOURCES: Record<
  ConfigSource,
  {
    control: 'allowedPresentationConfigs' | 'allowedIssuanceConfigs';
    title: string;
    plural: string;
    /** The roles that may list the configurations; one is enough. */
    roles: Role[];
  }
> = {
  presentation: {
    control: 'allowedPresentationConfigs',
    title: 'Presentation configurations',
    plural: 'presentation configurations',
    roles: ['presentation:manage', 'presentation:request'],
  },
  issuance: {
    control: 'allowedIssuanceConfigs',
    title: 'Credential types',
    plural: 'credential types',
    roles: ['issuance:manage'],
  },
};

export function createClientForm() {
  return new FormGroup({
    clientId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, clientIdValidator],
    }),
    description: new FormControl('', { nonNullable: true }),
    roles: new FormControl<string[]>([], { nonNullable: true, validators: Validators.required }),
    allowedPresentationConfigs: new FormControl<string[]>([], { nonNullable: true }),
    allowedIssuanceConfigs: new FormControl<string[]>([], { nonNullable: true }),
  });
}

export type ClientForm = ReturnType<typeof createClientForm>;

/** Fills the form with a stored client; its ID cannot change. */
export function fillClientForm(form: ClientForm, client: ClientEntity): void {
  form.reset({
    clientId: client.clientId,
    description: client.description ?? '',
    roles: [...(client.roles ?? [])],
    allowedPresentationConfigs: [...(client.allowedPresentationConfigs ?? [])],
    allowedIssuanceConfigs: [...(client.allowedIssuanceConfigs ?? [])],
  });
  form.controls.clientId.disable();
}

function update(form: ClientForm): UpdateClientDto {
  const raw = form.getRawValue();
  return {
    description: raw.description.trim() || undefined,
    roles: raw.roles as UpdateClientDto['roles'],
    allowedPresentationConfigs: raw.allowedPresentationConfigs,
    allowedIssuanceConfigs: raw.allowedIssuanceConfigs,
  };
}

/** The request of the form: a new client, or the changes to a stored one. */
export function clientRequest(
  form: ClientForm,
  editing: boolean
): { method: 'POST'; body: CreateClientDto } | { method: 'PATCH'; body: UpdateClientDto } {
  if (editing) return { method: 'PATCH', body: update(form) };
  const body = update(form);
  return {
    method: 'POST',
    body: {
      clientId: form.getRawValue().clientId.trim(),
      ...body,
      roles: body.roles ?? [],
    },
  };
}
