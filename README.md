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
