import type { Provider } from '@angular/core';
import { type FormlyFieldConfig, provideFormlyCore } from '@ngx-formly/core';
import {
  labelOfKey,
  SchemaArrayType,
  SchemaCheckboxType,
  SchemaFieldWrapper,
  SchemaInputType,
  SchemaObjectType,
  SchemaSelectType,
} from './schema-form-types';

function labelOf(field: FormlyFieldConfig): string {
  return field.props?.label || labelOfKey(field.key) || 'This field';
}

function count(value: unknown, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

/**
 * Formly for forms built from a JSON Schema (`FormlyJsonschema`), with the field types of the
 * Web Client: the JSON Schema types `string`, `number`, `integer`, `boolean`, `object` and `array`
 * and enums, as the current Web Client registers them, and a message for every validator they
 * use. Provide it on the route of a page that renders such a form, so formly loads with it.
 */
export function provideSchemaForms(): Provider {
  return provideFormlyCore({
    wrappers: [{ name: 'form-field', component: SchemaFieldWrapper }],
    types: [
      { name: 'input', component: SchemaInputType, wrappers: ['form-field'] },
      { name: 'string', extends: 'input' },
      { name: 'number', extends: 'input', defaultOptions: { props: { type: 'number' } } },
      { name: 'integer', extends: 'input', defaultOptions: { props: { type: 'number' } } },
      { name: 'checkbox', component: SchemaCheckboxType, wrappers: ['form-field'] },
      { name: 'boolean', extends: 'checkbox' },
      { name: 'select', component: SchemaSelectType, wrappers: ['form-field'] },
      { name: 'enum', extends: 'select' },
      { name: 'object', component: SchemaObjectType },
      { name: 'array', component: SchemaArrayType },
    ],
    validationMessages: [
      { name: 'required', message: (_error, field) => `Enter ${labelOf(field)}.` },
      {
        name: 'minLength',
        message: (_error, field) =>
          `Enter at least ${count(field.props?.minLength, 'character', 'characters')}.`,
      },
      {
        name: 'maxLength',
        message: (_error, field) =>
          `Enter at most ${count(field.props?.maxLength, 'character', 'characters')}.`,
      },
      {
        name: 'pattern',
        message: (_error, field) => `Use the format ${field.props?.pattern}.`,
      },
      { name: 'min', message: (_error, field) => `Enter ${field.props?.min} or more.` },
      { name: 'max', message: (_error, field) => `Enter ${field.props?.max} or less.` },
      {
        name: 'exclusiveMinimum',
        message: (_error, field) => `Enter more than ${field.props?.['exclusiveMinimum']}.`,
      },
      {
        name: 'exclusiveMaximum',
        message: (_error, field) => `Enter less than ${field.props?.['exclusiveMaximum']}.`,
      },
      {
        name: 'multipleOf',
        message: (_error, field) => `Enter a multiple of ${field.props?.step}.`,
      },
      {
        name: 'minItems',
        message: (_error, field) =>
          `Add at least ${count(field.props?.['minItems'], 'item', 'items')}.`,
      },
      {
        name: 'maxItems',
        message: (_error, field) =>
          `Keep at most ${count(field.props?.['maxItems'], 'item', 'items')}.`,
      },
      { name: 'uniqueItems', message: 'Remove the items that repeat another.' },
      {
        name: 'const',
        message: (_error, field) => `This must be ${JSON.stringify(field.props?.['const'])}.`,
      },
      { name: 'enum', message: 'Choose one of the values offered.' },
      { name: 'type', message: 'Enter a value of the type the credential expects.' },
    ],
  });
}
