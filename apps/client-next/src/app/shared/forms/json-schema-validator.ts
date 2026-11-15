import type { ValidatorFn } from '@angular/forms';
import Ajv, { type ErrorObject } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

/** Ajv's errors as one line, naming the property `additionalProperties: false` refused. */
function describe(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => {
      const text = `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`;
      const extra = (error.params as { additionalProperty?: string }).additionalProperty;
      return error.keyword === 'additionalProperties' && extra ? `${text} "${extra}"` : text;
    })
    .join('; ');
}

/**
 * Checks a JSON text against `schema`: empty passes, text that is no JSON gives `invalidJson`,
 * JSON the schema refuses gives `invalidSchema` with Ajv's reason. A `$schema` key is ignored.
 */
export function jsonSchemaValidator(schema: object): ValidatorFn {
  const ajv = new Ajv({ allowUnionTypes: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  return (control) => {
    if (control.value == null || control.value === '') return null;
    let value: unknown;
    try {
      value = typeof control.value === 'string' ? JSON.parse(control.value) : control.value;
    } catch (error) {
      return { invalidJson: (error as Error).message };
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const copy = { ...(value as Record<string, unknown>) };
      delete copy['$schema'];
      value = copy;
    }
    return validate(value) ? null : { invalidSchema: describe(validate.errors) };
  };
}

/** The object of a JSON text without its `$schema`; null for empty text or an empty object. */
export function jsonObject(text: string | null | undefined): Record<string, unknown> | null {
  if (!text?.trim()) return null;
  const value = JSON.parse(text) as Record<string, unknown>;
  delete value['$schema'];
  return Object.keys(value).length ? value : null;
}
