import { FormControl, FormGroup, Validators, type AbstractControl } from '@angular/forms';
import type {
  CredentialConfig,
  ExternalTrustListEntity,
  InternalTrustListEntity,
  PresentationConfig,
  TrustList,
  TrustListCreateDto,
} from '@eudiplo/sdk-core';
import trustListSchema from '../../../../../../../schemas/TrustListCreateDto.schema.json';

const entityInfoSchema =
  trustListSchema.properties.entities.items.oneOf[0].properties.info.properties;
const EMAIL_PATTERN = new RegExp(entityInfoSchema.contactUri.pattern);
const WEBSITE_PATTERN = new RegExp(entityInfoSchema.website.pattern);
const PHONE_PATTERN = new RegExp(entityInfoSchema.phone.pattern);

interface TrustListEntityControls {
  providerType: FormControl<'attestation-provider' | 'wallet-provider'>;
  type: FormControl<'internal' | 'external'>;
  issuerKeyChainId: FormControl<string>;
  revocationKeyChainId: FormControl<string>;
  issuerCertPem: FormControl<string>;
  revocationCertPem: FormControl<string>;
  infoName: FormControl<string>;
  infoLang: FormControl<string>;
  infoUri: FormControl<string>;
  infoCountry: FormControl<string>;
  infoLocality: FormControl<string>;
  infoPostalCode: FormControl<string>;
  infoStreetAddress: FormControl<string>;
  infoContactUri: FormControl<string>;
  infoWebsite: FormControl<string>;
  infoPhone: FormControl<string>;
}

export type TrustListEntityForm = FormGroup<TrustListEntityControls>;

type EntityValue = ReturnType<TrustListEntityForm['getRawValue']>;

/** A form row; only the controls used for its selected type are required. */
export function createEntityForm(
  type: 'internal' | 'external',
  values: Partial<EntityValue> = {}
): TrustListEntityForm {
  return new FormGroup<TrustListEntityControls>({
    providerType: new FormControl(values.providerType ?? 'attestation-provider', {
      nonNullable: true,
    }),
    type: new FormControl(type, { nonNullable: true }),
    issuerKeyChainId: new FormControl(values.issuerKeyChainId ?? '', {
      nonNullable: true,
      validators: type === 'internal' ? Validators.required : [],
    }),
    revocationKeyChainId: new FormControl(values.revocationKeyChainId ?? '', {
      nonNullable: true,
      validators: type === 'internal' ? Validators.required : [],
    }),
    issuerCertPem: new FormControl(values.issuerCertPem ?? '', {
      nonNullable: true,
      validators: type === 'external' ? Validators.required : [],
    }),
    revocationCertPem: new FormControl(values.revocationCertPem ?? '', {
      nonNullable: true,
      validators: type === 'external' ? Validators.required : [],
    }),
    infoName: new FormControl(values.infoName ?? '', {
      nonNullable: true,
      validators: Validators.required,
    }),
    infoLang: new FormControl(values.infoLang ?? 'en', { nonNullable: true }),
    infoUri: new FormControl(values.infoUri ?? '', { nonNullable: true }),
    infoCountry: new FormControl(values.infoCountry ?? '', { nonNullable: true }),
    infoLocality: new FormControl(values.infoLocality ?? '', { nonNullable: true }),
    infoPostalCode: new FormControl(values.infoPostalCode ?? '', { nonNullable: true }),
    infoStreetAddress: new FormControl(values.infoStreetAddress ?? '', { nonNullable: true }),
    infoContactUri: new FormControl(values.infoContactUri ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(EMAIL_PATTERN)],
    }),
    infoWebsite: new FormControl(values.infoWebsite ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(WEBSITE_PATTERN), serializedUrl],
    }),
    infoPhone: new FormControl(values.infoPhone ?? '', {
      nonNullable: true,
      validators: [Validators.pattern(PHONE_PATTERN)],
    }),
  });
}

function serializedUrl(control: AbstractControl): { serializedUrl: string | true } | null {
  const value: unknown = control.value;
  if (typeof value !== 'string' || !value || !WEBSITE_PATTERN.test(value)) return null;
  try {
    const href = new URL(value).href;
    return href === value || href === `${value}/` ? null : { serializedUrl: href };
  } catch {
    return { serializedUrl: true };
  }
}

/** Converts stored form config, or the published LoTE fallback, into editable form rows. */
export function entityFormsFromTrustList(list: TrustList): TrustListEntityForm[] {
  const saved = list.entityConfig;
  if (Array.isArray(saved)) {
    return saved.flatMap((raw) => {
      const entity = record(raw);
      if (!entity) return [];
      const info = record(entity['info']) ?? {};
      const type = entity['type'] === 'internal' ? 'internal' : 'external';
      return [
        createEntityForm(type, {
          providerType:
            entity['providerType'] === 'wallet-provider'
              ? 'wallet-provider'
              : 'attestation-provider',
          issuerKeyChainId: text(entity['issuerKeyChainId']),
          revocationKeyChainId: text(entity['revocationKeyChainId']),
          issuerCertPem: text(entity['issuerCertPem']),
          revocationCertPem: text(entity['revocationCertPem']),
          ...readInfo(info),
        }),
      ];
    });
  }
  return entitiesFromPublishedData(list.data);
}

function entitiesFromPublishedData(data: TrustList['data']): TrustListEntityForm[] {
  const trustEntities = record(data?.['LoTE'])?.['TrustedEntitiesList'];
  if (!Array.isArray(trustEntities)) return [];
  return trustEntities.flatMap((raw) => {
    const entity = record(raw);
    if (!entity) return [];
    const info = record(entity['TrustedEntityInformation']);
    const address = record(info?.['TEAddress']);
    const postal = Array.isArray(address?.['TEPostalAddress'])
      ? record(address['TEPostalAddress'][0])
      : undefined;
    const services = Array.isArray(entity['TrustedEntityServices'])
      ? entity['TrustedEntityServices'].map(record).filter(isRecord)
      : [];
    const issuance = services.find((service) =>
      serviceText(service, 'ServiceTypeIdentifier').includes('Issuance')
    );
    const revocation = services.find((service) =>
      serviceText(service, 'ServiceTypeIdentifier').includes('Revocation')
    );
    const electronic = Array.isArray(address?.['TEElectronicAddress'])
      ? address['TEElectronicAddress'].map(record).filter(isRecord)
      : [];
    const addressValues = electronic.map((item) => text(item['uriValue']));
    const issuerCertPem = pemFromService(issuance);
    const revocationCertPem = pemFromService(revocation);
    return [
      createEntityForm('external', {
        providerType: serviceText(issuance, 'ServiceTypeIdentifier').includes('/WalletSolution/')
          ? 'wallet-provider'
          : 'attestation-provider',
        issuerCertPem,
        revocationCertPem,
        ...readInfo({
          name: firstLocalized(info?.['TEName'], 'value'),
          lang: firstLocalized(info?.['TEName'], 'lang') || 'en',
          uri: firstLocalized(info?.['TEInformationURI'], 'uriValue'),
          country: text(postal?.['Country']),
          locality: text(postal?.['Locality']),
          postalCode: text(postal?.['PostalCode']),
          streetAddress: text(postal?.['StreetAddress']),
          contactUri: addressValues.find((value) => value.startsWith('mailto:'))?.slice(7) ?? '',
          website: addressValues.find((value) => /^https?:/.test(value)) ?? '',
          phone: addressValues.find((value) => value.startsWith('tel:')) ?? '',
        }),
      }),
    ];
  });
}

/** The accepted entity payload, omitting unused internal/external controls and blank optional data. */
export function entityPayload(
  form: TrustListEntityForm
): InternalTrustListEntity | ExternalTrustListEntity {
  const value = form.getRawValue();
  const info = {
    name: value.infoName.trim(),
    contactUri: value.infoContactUri.trim(),
    website: value.infoWebsite.trim(),
    ...compact({
      lang: optional(value.infoLang),
      uri: optional(value.infoUri),
      country: optional(value.infoCountry),
      locality: optional(value.infoLocality),
      postalCode: optional(value.infoPostalCode),
      streetAddress: optional(value.infoStreetAddress),
      phone: optional(value.infoPhone),
    }),
  };
  return value.type === 'internal'
    ? {
        type: 'internal',
        providerType: value.providerType,
        issuerKeyChainId: value.issuerKeyChainId,
        revocationKeyChainId: value.revocationKeyChainId,
        info,
      }
    : {
        type: 'external',
        providerType: value.providerType,
        issuerCertPem: value.issuerCertPem,
        revocationCertPem: value.revocationCertPem,
        info,
      };
}

export function trustListBody(
  value: { id: string; description: string; keyChainId: string },
  entities: readonly TrustListEntityForm[]
): TrustListCreateDto {
  return {
    id: value.id.trim(),
    ...(optional(value.description) ? { description: optional(value.description) } : {}),
    ...(optional(value.keyChainId) ? { keyChainId: optional(value.keyChainId) } : {}),
    entities: entities.map(entityPayload),
  };
}

export function trustListControlPath(path: string): string | undefined {
  if (/^entities\.\d+\.type$/.test(path)) return undefined;
  return path.replace(
    /^(entities\.\d+\.)info\.(\w)(\w*)$/,
    (_match, row: string, first: string, rest: string) => `${row}info${first.toUpperCase()}${rest}`
  );
}

export function credentialConfigReferencesTrustList(
  config: CredentialConfig,
  list: Pick<TrustList, 'id' | 'tenantId'>
): boolean {
  const authorities = (config.schemaMeta as { trustedAuthorities?: unknown[] } | undefined)
    ?.trustedAuthorities;
  return (
    authorities?.some((raw) => {
      const authority = record(raw);
      if (!authority) return false;
      return (
        authority['trustListId'] === list.id ||
        (authority['frameworkType'] === 'etsi_tl' &&
          (authority['value'] === list.id ||
            urlNamesTrustList(text(authority['value']), list.id, list.tenantId)))
      );
    }) ?? false
  );
}

export function presentationConfigReferencesTrustList(
  config: PresentationConfig,
  list: Pick<TrustList, 'id' | 'tenantId'>
): boolean {
  return (
    config.dcql_query?.credentials?.some((credential) =>
      credential.trusted_authorities?.some(
        (authority) =>
          authority.type === 'etsi_tl' &&
          authority.values.some(
            (reference) =>
              reference.trustListId?.trim() === list.id ||
              urlNamesTrustList(reference.url, list.id, list.tenantId)
          )
      )
    ) ?? false
  );
}

function urlNamesTrustList(url: string | undefined, listId: string, tenantId: string): boolean {
  if (!url) return false;
  const segments = url.split(/[?#]/, 1)[0].split('/');
  if (segments.at(-1) === '') segments.pop();
  const id = decodeSegment(segments.pop() ?? '');
  if (segments.pop() !== 'trust-list' || id !== listId) return false;
  if (segments.join('/') === '<TENANT_URL>') return true;
  const tenant = decodeSegment(segments.pop() ?? '');
  return segments.pop() === 'issuers' && tenant === tenantId;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function readInfo(info: Record<string, unknown>): Partial<EntityValue> {
  return {
    infoName: text(info['name']),
    infoLang: text(info['lang']) || 'en',
    infoUri: text(info['uri']),
    infoCountry: text(info['country']),
    infoLocality: text(info['locality']),
    infoPostalCode: text(info['postalCode']),
    infoStreetAddress: text(info['streetAddress']),
    infoContactUri: text(info['contactUri']).replace(/^mailto:/, ''),
    infoWebsite: text(info['website']),
    infoPhone: text(info['phone']),
  };
}

function firstLocalized(items: unknown, key: string): string {
  return Array.isArray(items) ? text(record(items[0])?.[key]) : '';
}

function serviceText(service: Record<string, unknown> | undefined, key: string): string {
  const information = record(service?.['ServiceInformation']);
  return text(information?.[key]);
}

function pemFromService(service: Record<string, unknown> | undefined): string {
  const identity = record(record(service?.['ServiceInformation'])?.['ServiceDigitalIdentity']);
  const certificates = identity?.['X509Certificates'];
  const encoded = Array.isArray(certificates) ? text(record(certificates[0])?.['val']) : '';
  if (!encoded) return '';
  const lines = encoded.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}

function optional(value: string): string | undefined {
  return value.trim() || undefined;
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isRecord(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return value !== undefined;
}
