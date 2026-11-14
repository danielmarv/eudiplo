# EUDIPLO Web Client (rebuild)

The EUDIPLO Web Client rebuilt with Angular 22, Tailwind CSS 4, [spartan/ui](https://spartan.ng) (shadcn/ui for Angular) and [TanStack Query](https://tanstack.com/query/latest/docs/framework/angular/overview). It replaces `apps/client` feature by feature; until a feature has moved, its page shows "Not rebuilt yet" and the current client keeps working next to it.

## Commands

Run from the repository root:

```bash
pnpm dev:client-next                               # ng serve on http://localhost:4300
pnpm --filter @eudiplo/client-next build
pnpm --filter @eudiplo/client-next test --watch=false
pnpm --filter @eudiplo/client-next lint
pnpm --filter @eudiplo/client-next format
```

The app talks to the backend at `http://localhost:3000` in development, like `apps/client`. It runs on its own port and origin, so its session is separate from the current client's.

`pnpm dev:client-next` first runs `scripts/write-dev-env.mjs`, which writes `AUTH_CLIENT_ID` and `AUTH_CLIENT_SECRET` from the repository's `.env` (the file the backend reads) to `.dev/env.js`, so the login page starts pre-filled with the client the local backend accepts. `.dev/` is git-ignored and only the development build serves it, so the secret is neither committed nor part of a production build. `ng serve` on its own skips the script, and the form starts empty.

## Folder structure

```text
apps/client-next/
├── libs/ui/                 # spartan/ui components (generated, then ours to edit)
├── public/                  # static files: logo, env.js, silent-check-sso.html
└── src/
    ├── styles.css           # Tailwind, the theme tokens, fonts
    └── app/
        ├── app.ts, app.config.ts, app.routes.ts
        ├── core/            # singletons without UI
        │   ├── auth/        # session, OIDC, caller and roles, guards
        │   ├── config/      # environment, theme, frontend config query
        │   ├── errors/      # messages for failed requests
        │   └── notify/      # notices (toasts)
        ├── layout/          # the shell: sidebar, header, navigation model
        ├── shared/          # reusable app components and helpers
        │   ├── api-key-endpoint/ # form of endpoints called with an API key (attribute providers, webhooks)
        │   ├── brand/       # Diplo, the guilloche, monograms
        │   ├── clipboard/   # copy with a notice
        │   ├── config-ownership/ # file-managed locks, ownership notice, configuration download
        │   ├── data-table/  # TanStack Table features, sort toggle, pagination bar
        │   ├── format/      # durations, dates, relative times, JWT parts
        │   ├── forms/       # field-to-fix, focus helpers, controls of default-able settings
        │   ├── pages/       # page header, placeholder page
        │   ├── sessions/    # what a session holds, such as the claims a wallet presented
        │   └── testing/     # helpers for specs
        └── features/        # one folder per feature
```

A feature folder follows one shape:

```text
features/<feature>/
├── <feature>.routes.ts      # its routes, lazy loaded from app.routes.ts
├── data/                    # TanStack Query: query options, mutations, query keys
├── pages/                   # routed components: they load data and handle actions
└── components/              # presentational components: inputs in, outputs out
```

To move a feature from `apps/client`, replace its `pending(...)` route in `app.routes.ts` with the feature's routes, keep the roles of its guard, and bring its specs along.

## Conventions

**Components.** Standalone, `ChangeDetectionStrategy.OnPush` (lint enforces it), `inject()` instead of constructor parameters, signals for state, `input()` and `output()`. The app is zoneless: a template only updates when a signal it reads changes, so keep component state in signals. Components name their file and class without a suffix (`login.ts` holds `Login`), as the Angular style guide does; services keep `.service.ts`.

**Data.** Call the backend only through `@eudiplo/sdk-core`. Wrap each call in a `queryOptions` or mutation in the feature's `data/` folder, with a query key that starts with the resource and includes the instance URL, so a sign-in elsewhere never shows another instance's data. The SDK throws the backend's error body; show it with `getApiErrorMessage` from `core/errors` and `NotifyService.error`.

**Lists.** A list is a [TanStack Table](https://tanstack.com/table/latest/docs/framework/angular/angular-table) built with `injectTable` and the shared `listFeatures` (`shared/data-table`): sorting, a search over several fields (`searchIn`), column filters and pagination, all in the browser, since the backend returns lists whole. Keep the columns in a constant outside the component, hold sorting and pagination in signals, and go back to the first page when the search, a filter or the order changes. The template writes the cells itself, so links and buttons stay ordinary Angular markup; headers use `<app-sort-toggle>` with `ariaSort`, and the foot `<app-table-pagination>`.

**Notices.** Use `NotifyService` (`success`, `info`, `warning`, `error`). An error stays long enough to read its message, and one with an action (Retry) can stay until it is closed.

**Forms.** Reactive Forms with spartan's `hlm-field`: `<label hlmFieldLabel>`, an input with `hlmInput`, and one `<hlm-field-error validator="…">` per validator, which shows the error once the field is touched and links it with `aria-describedby`. A Save stays usable while fields are invalid: on submit, `showFieldsToFix` marks them touched, says which sections hold errors and focuses the first one.

**Unavailable actions.** Keep the button focusable with `aria-disabled="true"` instead of `disabled`, check the condition again in the handler, and say the reason in text next to the button, linked with `aria-describedby`, not only in a tooltip.

**Accessibility.** Give an icon-only button an `aria-label` (lint enforces it for `hlmBtn` with an icon size). Every page starts with `<app-page-header>`, whose `h1` can take focus. Keep the skip link and the landmarks of the shell.

**Styling.** Use the theme tokens (`bg-background`, `text-muted-foreground`, `bg-primary`, `border`, and the `brand-*` colours) instead of literal colours, so both themes stay readable. Bricolage Grotesque is for headings (`font-heading`), Atkinson Hyperlegible Next for text, Martian Mono for IDs, roles and code (`font-mono`). The navy brand chrome and the amber folded corner of Diplo are the only strong accents; keep the rest quiet.

## spartan/ui components

`libs/ui` holds the spartan "helm" components in the `vega` style, imported as `@spartan-ng/helm/<name>` (see `tsconfig.json`). They were generated by the spartan CLI and are ours to change; Prettier and ESLint skip them, so a later regeneration diffs cleanly. The spartan CLI depends on Nx, so it is not a dependency here. To add a component, run the CLI in a scratch Angular project with this `components.json`, then copy the generated `libs/ui/<name>` folder here.

## Carried over from `apps/client`

The session and token handling, OIDC, the caller and its roles, the error messages and the form helpers came over with their specs, renamed where the old name did not say what the code does: `ApiService` is `SessionService`, `JwtService` is `CallerService`. The login page keeps the behaviour of the old one: kept and ended sessions, the instance check for SSO, and the confirmation before signing in at an instance a link chose.

Not carried over yet: the reaction to refused requests and expiring tokens (`ApiRefusalService` is here, but not started), the version check, and the Playwright tests.
