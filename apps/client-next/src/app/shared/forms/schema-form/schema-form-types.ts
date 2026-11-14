import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import {
  FieldArrayType,
  type FieldArrayTypeConfig,
  FieldType,
  type FieldTypeConfig,
  FieldWrapper,
  type FormlyFieldConfig,
  FormlyAttributes,
  FormlyField,
  FormlyValidationMessagesPipe,
} from '@ngx-formly/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMinus, lucidePlus } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmInputImports } from '@spartan-ng/helm/input';

/**
 * The fields of a form that formly builds from a JSON Schema, such as the claims of a credential,
 * in the Web Client's look: an input for strings and numbers, a checkbox, a select for an enum,
 * and a group for an object or a list. Labels and descriptions are text, never HTML: they come
 * from configuration the user may not have written.
 */

/** "family_name" as "Family name": a label for a field or group that has no title. */
export function labelOfKey(key: FormlyFieldConfig['key']): string {
  const raw = Array.isArray(key) ? key.at(-1) : key;
  const text = raw == null ? '' : String(raw).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

/**
 * The label, description and error of a field. The error shows once the field is touched or the
 * form was submitted, and the field names it in `aria-describedby`.
 */
@Component({
  selector: 'app-schema-field-wrapper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsyncPipe, FormlyValidationMessagesPipe],
  template: `
    <div class="grid gap-1.5">
      @if (props.label && !props['hideLabel']) {
        <label [for]="id" class="text-sm font-medium">
          {{ props.label }}
          @if (props.required) {
            <span class="text-muted-foreground font-normal">(required)</span>
          }
        </label>
      }
      <ng-container #fieldComponent />
      @if (props.description) {
        <p [id]="id + '-description'" class="text-muted-foreground text-sm">
          {{ props.description }}
        </p>
      }
      @if (showError) {
        @let messages = field | validationMessages | async;
        @if (messages?.length) {
          <p [id]="id + '-error'" class="text-destructive text-sm" role="alert">
            {{ messages![0].message }}
          </p>
        }
      }
    </div>
  `,
})
export class SchemaFieldWrapper extends FieldWrapper {}

/** What a field's input names in `aria-describedby`: its description and its error. */
function describedBy(field: {
  readonly id: string;
  readonly showError: boolean;
  readonly props: { description?: unknown };
}): string | null {
  const ids = [
    field.props.description ? `${field.id}-description` : '',
    field.showError ? `${field.id}-error` : '',
  ].filter(Boolean);
  return ids.length ? ids.join(' ') : null;
}

/**
 * A text or number input; `props.type` `number` gets a number input, whose value is a number.
 * `hlmInput` gives an input an ID of its own unless it gets one, so it gets formly's, which the
 * label points at.
 */
@Component({
  selector: 'app-schema-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FormlyAttributes, HlmInputImports],
  template: `
    @if (props.type === 'number') {
      <input
        hlmInput
        type="number"
        [id]="id"
        class="h-10 w-full"
        [formControl]="formControl"
        [formlyAttributes]="field"
        [attr.aria-invalid]="showError || null"
        [attr.aria-describedby]="describedBy"
      />
    } @else {
      <input
        hlmInput
        class="h-10 w-full"
        [id]="id"
        [type]="props.type || 'text'"
        [formControl]="formControl"
        [formlyAttributes]="field"
        [attr.aria-invalid]="showError || null"
        [attr.aria-describedby]="describedBy"
      />
    }
  `,
})
export class SchemaInputType extends FieldType<FieldTypeConfig> {
  protected get describedBy(): string | null {
    return describedBy(this);
  }
}

/** A yes-or-no claim: a checkbox with its label beside it. */
@Component({
  selector: 'app-schema-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, HlmCheckboxImports],
  template: `
    <label class="flex cursor-pointer items-center gap-2.5 text-sm font-medium" [for]="id">
      <!-- No formlyAttributes: they would give the host the checkbox's ID a second time. -->
      <hlm-checkbox [inputId]="id" [formControl]="formControl" [aria-describedby]="describedBy" />
      {{ props.label }}
    </label>
  `,
})
export class SchemaCheckboxType extends FieldType<FieldTypeConfig> {
  override defaultOptions = { props: { hideLabel: true } };

  protected get describedBy(): string | null {
    return describedBy(this);
  }
}

/** One value of a list the schema allows (`enum`), in a native select that keeps its type. */
@Component({
  selector: 'app-schema-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FormlyAttributes],
  template: `
    <select
      class="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-10 w-full rounded-md border bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:ring-3"
      [formControl]="formControl"
      [formlyAttributes]="field"
      [attr.aria-invalid]="showError || null"
      [attr.aria-describedby]="describedBy"
    >
      @if (!props.required) {
        <option [ngValue]="undefined">None</option>
      }
      @for (option of choices; track $index) {
        <option [ngValue]="option.value">{{ option.label ?? option.value }}</option>
      }
    </select>
  `,
})
export class SchemaSelectType extends FieldType<FieldTypeConfig> {
  protected get choices(): { value: unknown; label?: string }[] {
    const options = this.props.options;
    return Array.isArray(options) ? options : [];
  }

  protected get describedBy(): string | null {
    return describedBy(this);
  }
}

/** A group of claims: its title, its description and its fields, set off from the rest. */
@Component({
  selector: 'app-schema-object',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsyncPipe, FormlyField, FormlyValidationMessagesPipe],
  template: `
    <fieldset class="grid gap-4" [class]="nested ? 'border-s-2 ps-4' : ''">
      @if (label) {
        <legend class="mb-3 text-sm font-semibold">{{ label }}</legend>
      }
      @if (props.description) {
        <p class="text-muted-foreground -mt-2 text-sm">{{ props.description }}</p>
      }
      @if (showError && formControl.errors) {
        @let messages = field | validationMessages | async;
        @if (messages?.length) {
          <p class="text-destructive text-sm" role="alert">{{ messages![0].message }}</p>
        }
      }
      @for (child of field.fieldGroup; track child.id ?? $index) {
        <formly-field [field]="child" />
      }
    </fieldset>
  `,
})
export class SchemaObjectType extends FieldType {
  /** The form's root object has the card's title; nested ones get their own. */
  protected get nested(): boolean {
    return !!this.field.parent?.parent;
  }

  protected get label(): string {
    if (!this.nested) return '';
    return this.props.label || labelOfKey(this.field.key);
  }
}

/** A list of values or groups, with Add and Remove. A list that must not be empty says so. */
@Component({
  selector: 'app-schema-array',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsyncPipe, NgIcon, FormlyField, FormlyValidationMessagesPipe, HlmButtonImports],
  providers: [provideIcons({ lucideMinus, lucidePlus })],
  template: `
    <fieldset class="grid gap-3 border-s-2 ps-4">
      <legend class="mb-3 flex w-full items-center justify-between gap-3">
        <span class="text-sm font-semibold">{{ label }}</span>
      </legend>
      @if (props.description) {
        <p class="text-muted-foreground -mt-2 text-sm">{{ props.description }}</p>
      }
      @if (showError && formControl.errors) {
        @let messages = field | validationMessages | async;
        @if (messages?.length) {
          <p class="text-destructive text-sm" role="alert">{{ messages![0].message }}</p>
        }
      }
      @for (item of field.fieldGroup; track item.id ?? $index; let index = $index) {
        <div class="flex items-start gap-2">
          <formly-field class="min-w-0 flex-1" [field]="item" />
          @if (item.props?.['removable'] !== false) {
            <button
              hlmBtn
              variant="ghost"
              size="icon-sm"
              type="button"
              class="mt-6 shrink-0"
              [attr.aria-label]="'Remove item ' + (index + 1) + ' of ' + label"
              (click)="remove(index)"
            >
              <ng-icon name="lucideMinus" />
            </button>
          }
        </div>
      }
      <div>
        <button hlmBtn variant="outline" size="sm" type="button" (click)="add()">
          <ng-icon name="lucidePlus" aria-hidden="true" />
          Add to {{ label }}
        </button>
      </div>
    </fieldset>
  `,
})
export class SchemaArrayType extends FieldArrayType<FieldArrayTypeConfig> {
  protected get label(): string {
    return this.props.label || labelOfKey(this.field.key) || 'the list';
  }
}
