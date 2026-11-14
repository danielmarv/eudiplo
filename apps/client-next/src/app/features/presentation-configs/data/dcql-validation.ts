import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from '../../../../../../../schemas/DCQL.schema.json';

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);

/** Returns the first DCQL schema error, including its JSON location. */
export function dcqlSchemaError(value: unknown): string | null {
  if (validate(value)) return null;
  const error = validate.errors?.[0];
  if (!error) return 'The DCQL query does not match the DCQL schema.';
  const location = error.instancePath || '/';
  const extra = (error.params as { additionalProperty?: string }).additionalProperty;
  return `${location} ${error.message ?? 'is invalid'}${extra ? ` "${extra}"` : ''}.`;
}
