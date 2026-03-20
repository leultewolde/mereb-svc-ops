# svc-ops

`svc-ops` is the control-plane API for inventorying Mereb projects (services, MFEs, packages, infra) and for administering pilot runtime configuration. It aggregates data from seeded `.gitmodules` entries plus manual additions, and it now owns runtime flags plus invite-code onboarding.

## API surface

- GraphQL endpoint: `POST /graphql`
- Health checks:
  - `GET /healthz`
  - `GET /readyz`

Core GraphQL operations:

- query: `projects(kind, source)`
- query: `runtimeFlags`, `inviteCodes`
- mutations: `addProject(input)`, `refreshProjects`
- mutations: `createRuntimeFlag`, `updateRuntimeFlag`, `deleteRuntimeFlag`
- mutations: `createInviteCode`, `disableInviteCode`, `deleteInviteCode`

`addProject` persists manual entries to a JSON store (default `data/projects.local.json`).

Public HTTP operations:

- `GET /flags` returns `Record<string, boolean>` for runtime client flags
- `POST /invite/redeem` redeems an invite code and provisions a Keycloak user when invite-only registration is enabled

## Data sources

- gitmodules source:
  - defaults to embedded `gitmodules.seed`
  - override path with `GITMODULES_PATH`
- manual source:
  - defaults to `data/projects.local.json`
  - override path with `MANUAL_PROJECTS_PATH`

## Environment

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | - | Postgres connection string for the `svc_ops` schema. |
| `OIDC_ISSUER` | yes | - | JWT issuer. |
| `OIDC_AUDIENCE` | yes | - | JWT audience/client ID. |
| `GITMODULES_PATH` | no | `gitmodules.seed` | Optional source file for submodule inventory. |
| `MANUAL_PROJECTS_PATH` | no | `data/projects.local.json` | Optional manual projects store path. |
| `OPS_DEFAULT_FLAGS` | no | - | JSON array of default runtime flags to ensure at startup. |
| `KEYCLOAK_URL` | no | - | Required for invite redemption in hosted environments. |
| `KEYCLOAK_REALM` | no | - | Required for invite redemption in hosted environments. |
| `KEYCLOAK_INVITE_CLIENT_ID` | no | - | Confidential client used by `POST /invite/redeem`. |
| `KEYCLOAK_INVITE_CLIENT_SECRET` | no | - | Secret for the invite onboarding client. |
| `PROFILE_BOOTSTRAP_URL` | no | - | Internal `svc-profile` bootstrap endpoint used after invite redemption. |
| `PROFILE_BOOTSTRAP_SHARED_SECRET` | no | - | Shared secret for the profile bootstrap webhook. |
| `PRISMA_BASELINE_ON_P3005` | no | `0` | When set to `1`, allows a one-time Prisma baseline flow if startup sees `P3005` on a non-empty schema with no migration history. |
| `PRISMA_BASELINE_MIGRATION` | no | - | Migration directory name to mark as applied after the one-time baseline path succeeds. |
| `PORT` | no | `4009` | HTTP listen port. |
| `HOST` | no | `0.0.0.0` | HTTP listen host. |

## Access model

- admin read roles can list runtime flags and invite codes
- full admins can create, update, disable, and delete runtime flags and invite codes
- `GET /flags` and `POST /invite/redeem` are public endpoints intended for client/runtime consumption

## Local development

```bash
pnpm --filter @services/svc-ops dev
pnpm --filter @services/svc-ops build
pnpm --filter @services/svc-ops start
```

## Tests

```bash
pnpm --filter @services/svc-ops test
pnpm --filter @services/svc-ops test:integration
pnpm --filter @services/svc-ops test:ci
```

## Migration bootstrap

This service normally runs `prisma migrate deploy` on startup. Production also
enables a one-time fallback for the first rollout against an older non-empty
`svc_ops` schema that predates Prisma migration history:

1. `prisma migrate deploy`
2. if Prisma returns `P3005`, run `prisma db push --skip-generate`
3. mark `PRISMA_BASELINE_MIGRATION` as applied with `prisma migrate resolve`
4. rerun `prisma migrate deploy`

That fallback is gated by `PRISMA_BASELINE_ON_P3005=1` and is only intended for
existing environments being brought under Prisma Migrate for the first time.
