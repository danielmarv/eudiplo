import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBraces,
  lucideIdCard,
  lucidePlus,
  lucideShieldCheck,
  lucideTrash2,
  lucideX,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { asSentence, getApiErrorMessage } from '../../../core/errors/error-message';
import {
  type DcqlDraft,
  draftQuery,
  emptyCredential,
  parsePath,
  pathText,
  switchDraft,
} from '../data/dcql-draft';
import { federationAnchorsQuery, trustListsQuery } from '../data/presentation-config-queries';
import {
  type ClaimQuery,
  claimError,
  type SimpleCredentialQuery,
  type TrustedAuthority,
  trustError,
} from '../data/simple-dcql';

/**
 * The DCQL query of a presentation configuration: which credentials the wallet is asked for, which
 * of their claims, and whose issuers are trusted. The builder covers credentials by type with claim
 * paths and trusted authorities; anything else is edited as JSON. `showErrors` shows what is wrong
 * once the user tried to save.
 */
@Component({
  selector: 'app-dcql-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButtonImports, HlmInputImports, HlmNativeSelectImports, HlmTextareaImports],
  providers: [
    provideIcons({
      lucideBraces,
      lucideIdCard,
      lucidePlus,
      lucideShieldCheck,
      lucideTrash2,
      lucideX,
    }),
  ],
  host: { class: 'block' },
  templateUrl: './dcql-editor.html',
})
export class DcqlEditor {
  readonly draft = model.required<DcqlDraft>();
  readonly showErrors = model(false);

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);

  /** Loaded once a credential asks for trust, as most configurations need it. */
  protected readonly trustLists = injectQuery(() => trustListsQuery(this.instance, this.tenant()));
  protected readonly anchors = injectQuery(() =>
    federationAnchorsQuery(this.instance, this.tenant())
  );

  protected readonly problem = computed(() => draftQuery(this.draft()).error ?? '');
  protected readonly switchError = signal('');

  protected readonly pathText = pathText;
  protected readonly claimError = claimError;
  protected readonly trustError = trustError;
  protected readonly lookupError = (error: unknown, fallback: string) =>
    asSentence(getApiErrorMessage(error, fallback));

  /** Applies `change` to a copy of the builder's query. */
  private edit(change: (credentials: SimpleCredentialQuery[]) => void): void {
    const draft = this.draft();
    const simple = structuredClone(draft.simple);
    change(simple.credentials);
    this.draft.set({ ...draft, simple });
  }

  protected setMode(mode: DcqlDraft['mode']): void {
    const next = switchDraft(this.draft(), mode);
    if (typeof next === 'string') {
      this.switchError.set(next);
      return;
    }
    this.switchError.set('');
    this.draft.set(next);
  }

  protected setJson(json: string): void {
    this.switchError.set('');
    this.draft.set({ ...this.draft(), json });
  }

  protected addCredential(): void {
    this.edit((credentials) => credentials.push(emptyCredential(credentials.length)));
  }

  protected addCredentialSet(): void {
    const draft = this.draft();
    const simple = structuredClone(draft.simple);
    const firstId = simple.credentials[0]?.id;
    simple.credentialSets ??= [];
    simple.credentialSets.push({ options: firstId ? [[firstId]] : [[]] });
    this.draft.set({ ...draft, simple });
  }

  protected removeCredentialSet(index: number): void {
    const draft = this.draft();
    const simple = structuredClone(draft.simple);
    simple.credentialSets?.splice(index, 1);
    if (!simple.credentialSets?.length) delete simple.credentialSets;
    this.draft.set({ ...draft, simple });
  }

  protected addCredentialSetOption(index: number): void {
    const draft = this.draft();
    const simple = structuredClone(draft.simple);
    const firstId = simple.credentials[0]?.id;
    simple.credentialSets?.[index].options.push(firstId ? [firstId] : []);
    this.draft.set({ ...draft, simple });
  }

  protected removeCredentialSetOption(setIndex: number, optionIndex: number): void {
    const draft = this.draft();
    const simple = structuredClone(draft.simple);
    simple.credentialSets?.[setIndex].options.splice(optionIndex, 1);
    this.draft.set({ ...draft, simple });
  }

  protected setCredentialSetRequired(index: number, required: boolean): void {
    const draft = this.draft();
    const simple = structuredClone(draft.simple);
    const set = simple.credentialSets?.[index];
    if (set) {
      if (required) delete set.required;
      else set.required = false;
    }
    this.draft.set({ ...draft, simple });
  }

  protected toggleSetCredential(
    setIndex: number,
    optionIndex: number,
    credentialId: string,
    selected: boolean
  ): void {
    const draft = this.draft();
    const simple = structuredClone(draft.simple);
    const option = simple.credentialSets?.[setIndex].options[optionIndex];
    if (option) {
      const next = new Set(option);
      if (selected) next.add(credentialId);
      else next.delete(credentialId);
      simple.credentialSets![setIndex].options[optionIndex] = [...next];
    }
    this.draft.set({ ...draft, simple });
  }

  protected removeCredential(index: number): void {
    this.edit((credentials) => credentials.splice(index, 1));
  }

  protected setField(index: number, field: 'id' | 'type', value: string): void {
    this.edit((credentials) => (credentials[index][field] = value.trim()));
  }

  protected setFormat(index: number, format: SimpleCredentialQuery['format']): void {
    this.edit((credentials) => {
      const credential = credentials[index];
      credential.format = format;
      // mDOC claims are a namespace and a name; SD-JWT claims have no retention flag.
      credential.claims = credential.claims.map((claim) => {
        const next: ClaimQuery = { ...claim };
        if (format === 'dc+sd-jwt') delete next.intent_to_retain;
        return next;
      });
    });
  }

  protected addClaim(index: number): void {
    this.edit((credentials) =>
      credentials[index].claims.push({
        path: credentials[index].format === 'mso_mdoc' ? ['', ''] : [''],
      })
    );
  }

  protected removeClaim(index: number, claim: number): void {
    this.edit((credentials) => credentials[index].claims.splice(claim, 1));
  }

  protected setClaimId(index: number, claim: number, value: string): void {
    this.edit((credentials) => {
      const id = value.trim();
      if (id) credentials[index].claims[claim].id = id;
      else delete credentials[index].claims[claim].id;
    });
  }

  protected setClaimValues(index: number, claim: number, text: string): void {
    this.edit((credentials) => {
      const values = text
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean);
      if (values.length) credentials[index].claims[claim].values = values;
      else delete credentials[index].claims[claim].values;
    });
  }

  protected setIntentToRetain(index: number, claim: number, value: boolean): void {
    this.edit((credentials) => {
      if (value) credentials[index].claims[claim].intent_to_retain = true;
      else delete credentials[index].claims[claim].intent_to_retain;
    });
  }

  protected setPath(index: number, claim: number, text: string): void {
    this.edit((credentials) => (credentials[index].claims[claim].path = parsePath(text)));
  }

  protected setMdocPath(index: number, claim: number, part: 0 | 1, text: string): void {
    this.edit((credentials) => {
      const path = [...credentials[index].claims[claim].path];
      path[part] = text.trim();
      credentials[index].claims[claim].path = path;
    });
  }

  protected addTrust(index: number, kind: 'managed' | 'external' | 'federation'): void {
    this.edit((credentials) => {
      const authorities = (credentials[index].trustedAuthorities ??= []);
      if (kind === 'federation') {
        authorities.push({ type: 'openid_federation', values: [''] });
      } else {
        authorities.push({
          type: 'etsi_tl',
          values: [kind === 'managed' ? { trustListId: '' } : { url: '' }],
        });
      }
    });
  }

  protected removeTrust(index: number, authority: number): void {
    this.edit((credentials) => {
      const authorities = credentials[index].trustedAuthorities!;
      authorities.splice(authority, 1);
      if (!authorities.length) delete credentials[index].trustedAuthorities;
    });
  }

  /** Sets the one reference of an authority the builder added; others are kept as they are. */
  protected setTrust(index: number, authority: number, value: string): void {
    this.edit((credentials) => {
      const entry = credentials[index].trustedAuthorities![authority];
      if (entry.type === 'openid_federation') {
        entry.values[0] = value;
      } else {
        const reference = entry.values[0];
        entry.values[0] =
          reference.trustListId !== undefined
            ? { trustListId: value }
            : { ...reference, url: value.trim() };
      }
    });
  }

  protected trustKind(authority: TrustedAuthority): 'managed' | 'external' | 'federation' {
    if (authority.type === 'openid_federation') return 'federation';
    return authority.values[0]?.trustListId !== undefined ? 'managed' : 'external';
  }

  protected trustValue(authority: TrustedAuthority): string {
    if (authority.type === 'openid_federation') return authority.values[0] ?? '';
    return authority.values[0]?.trustListId ?? authority.values[0]?.url ?? '';
  }
}
