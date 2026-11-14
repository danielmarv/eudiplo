import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideConstruction } from '@ng-icons/lucide';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { PageHeader } from './page-header';

/**
 * Stands in for a page of the current Web Client (apps/client) that is not rebuilt yet, so
 * the navigation and the role guards can be tried before every feature has moved.
 */
@Component({
  selector: 'app-pending-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, NgIcon, HlmEmptyImports],
  providers: [provideIcons({ lucideConstruction })],
  template: `
    <app-page-header [heading]="title" />
    <hlm-empty class="bg-card rounded-xl border border-dashed">
      <hlm-empty-header>
        <hlm-empty-media variant="icon">
          <ng-icon name="lucideConstruction" />
        </hlm-empty-media>
        <h2 hlmEmptyTitle>Not rebuilt yet</h2>
        <p hlmEmptyDescription>
          This page is still being moved to the new Web Client. Until then, use it in the current
          Web Client.
        </p>
      </hlm-empty-header>
    </hlm-empty>
  `,
})
export class PendingPage {
  protected readonly title = inject(ActivatedRoute).snapshot.title ?? 'Page';
}
