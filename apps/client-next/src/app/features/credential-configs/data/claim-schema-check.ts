import type { AbstractControl, ValidationErrors } from '@angular/forms';
import {
  buildJsonSchema,
  type ClaimFieldDefinitionDto,
  flattenFields,
  type UnsupportedConstraint,
  unsupportedConstraints,
} from '@eudiplo/sdk-core';
import Ajv from 'ajv/dist/2020';
import credentialConfigSchema from '../../../../../../../schemas/CredentialConfigCreate.schema.json';
import { jsonSchemaValidator } from '../../../shared/forms/json-schema-validator';

/** A JSON pointer as a person reads it, e.g. `items › x-ui/hint` or `anyOf › entry 2`. */
function readablePointer(pointer: string): string {
  return pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .map((segment) => (/^\d+$/.test(segment) ? `entry ${Number(segment) + 1}` : segment))
    .join(' › ');
}

const WRONG_KIND: Record<Exclude<UnsupportedConstraint['reason'], 'unknown-keyword'>, string> = {
  'not-a-schema': 'must be a schema object or true/false',
  'not-a-list': 'must be a list of schemas',
  'not-a-map': 'must be an object of schemas',
};

/**
 * Why a claim's `constraints` would be refused on save, or undefined when every key is a JSON
 * Schema keyword the constraints accept and every subschema value has the right kind.
 */
export function unsupportedConstraintsError(constraints: unknown): string | undefined {
  if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) {
    return 'Enter a JSON object, e.g. { "pattern": "^[A-Z]{2}$" }.';
  }
  const unsupported = unsupportedConstraints(constraints);
  const unknown = unsupported.filter(({ reason }) => reason === 'unknown-keyword');
  if (unknown.length) {
    return `Not a supported JSON Schema keyword: ${unknown
      .map(({ pointer }) => readablePointer(pointer))
      .join(', ')}. Use keywords such as pattern, maxLength or items.`;
  }
  const [wrongKind] = unsupported;
  if (!wrongKind || wrongKind.reason === 'unknown-keyword') return undefined;
  return `${readablePointer(wrongKind.pointer)} ${WRONG_KIND[wrongKind.reason]}.`;
}

/**
 * Why issuance could not use the claim schema derived from these fields, or undefined when it
 * compiles: issuance compiles it with the same options, so an invalid pattern or a keyword the
 * type does not allow shows before saving, not at the first offer.
 */
export function claimSchemaError(fields: ClaimFieldDefinitionDto[]): string | undefined {
  for (const field of flattenFields(fields as Parameters<typeof flattenFields>[0])) {
    const refused =
      field.constraints === undefined ? undefined : unsupportedConstraintsError(field.constraints);
    if (refused) {
      return `Claim ${field.path.map((segment) => segment ?? '*').join('.')}: ${refused}`;
    }
  }
  const ajv = new Ajv({ allErrors: true, strict: true, useDefaults: true, validateSchema: false });
  try {
    ajv.compile(buildJsonSchema(fields as Parameters<typeof buildJsonSchema>[0]));
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
}

/**
 * The `constraints` of one claim field, cut out of the credential configuration schema so the
 * form accepts what the published schema accepts; its `$defs` resolve the references.
 */
const defs =
  (credentialConfigSchema as { $defs?: Record<string, { properties?: Record<string, unknown> }> })
    .$defs ?? {};
const claimField = Object.values(defs).find(
  (definition) => definition?.properties?.['constraints']
);
const constraintsSchema = jsonSchemaValidator({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  ...(claimField?.properties?.['constraints'] as object),
  $defs: defs,
});

/**
 * Validates the constraints text of a claim: empty means none; otherwise a JSON object of
 * keywords the API accepts. Whether issuance can compile them is checked on save.
 */
export function constraintsValidator(control: AbstractControl): ValidationErrors | null {
  const text = typeof control.value === 'string' ? control.value.trim() : '';
  if (!text) return null;
  let constraints: unknown;
  try {
    constraints = JSON.parse(text);
  } catch (error) {
    return { constraints: `Enter valid JSON: ${(error as Error).message}` };
  }
  const unsupported = unsupportedConstraintsError(constraints);
  if (unsupported) return { constraints: unsupported };
  const refused = constraintsSchema(control)?.['invalidSchema'];
  return refused ? { constraints: refused } : null;
}
