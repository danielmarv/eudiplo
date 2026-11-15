import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import { storageControllerUpload } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideImage, lucideUpload } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { getApiErrorMessage } from '../../core/errors/error-message';
import { NotifyService } from '../../core/notify/notify.service';

/**
 * An image by URL: typed in, or uploaded to the instance's storage, which answers with the URL
 * wallets load it from. Shows a preview once the URL is set.
 */
@Component({
  selector: 'app-image-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgIcon,
    HlmButtonImports,
    HlmInputImports,
    HlmSpinnerImports,
    HlmTooltipImports,
  ],
  providers: [provideIcons({ lucideImage, lucideUpload })],
  host: { class: 'grid gap-2' },
  template: `
    <label class="text-sm font-medium" [for]="inputId()">{{ label() }}</label>
    <div class="flex items-start gap-3">
      <span
        class="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg ring-1 ring-black/5"
        aria-hidden="true"
      >
        @if (control().value) {
          <img [src]="control().value" alt="" class="size-full object-contain" />
        } @else {
          <ng-icon name="lucideImage" />
        }
      </span>
      <input
        hlmInput
        class="h-10 min-w-0 flex-1 font-mono text-sm"
        type="url"
        [id]="inputId()"
        [formControl]="control()"
        placeholder="https://example.com/logo.png"
        spellcheck="false"
      />
      <input #file type="file" accept="image/*" class="hidden" (change)="upload($event)" />
      <button
        hlmBtn
        variant="outline"
        size="icon"
        type="button"
        [attr.aria-label]="'Upload ' + label().toLowerCase()"
        hlmTooltip="Upload an image"
        [attr.aria-busy]="uploading() || null"
        [attr.aria-disabled]="uploading() || null"
        (click)="uploading() || file.click()"
      >
        @if (uploading()) {
          <hlm-spinner class="size-4" />
        } @else {
          <ng-icon name="lucideUpload" />
        }
      </button>
    </div>
  `,
})
export class ImageField {
  readonly control = input.required<FormControl<string>>();
  readonly label = input.required<string>();
  readonly inputId = input.required<string>();

  private readonly notify = inject(NotifyService);
  protected readonly uploading = signal(false);

  protected async upload(event: Event): Promise<void> {
    const element = event.target as HTMLInputElement;
    const file = element.files?.[0];
    element.value = '';
    if (!file) return;
    this.uploading.set(true);
    try {
      const stored = (await storageControllerUpload({ body: { file } })).data;
      if (!stored?.url) throw new Error('The storage returned no URL for the image.');
      this.control().setValue(stored.url);
      this.control().markAsDirty();
      this.notify.success(`${this.label()} uploaded.`);
    } catch (error) {
      this.notify.error(getApiErrorMessage(error, 'The image could not be uploaded'));
    } finally {
      this.uploading.set(false);
    }
  }
}
