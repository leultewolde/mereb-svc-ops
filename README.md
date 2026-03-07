# svc-ops

`svc-ops` is the control-plane API for inventorying Mereb projects (services, MFEs, packages, infra). It aggregates data from seeded `.gitmodules` entries plus manual additions.

## API surface

- GraphQL endpoint: `POST /graphql`
- Health checks:
  - `GET /healthz`
  - `GET /readyz`

Core GraphQL operations:

- query: `projects(kind, source)`
- mutations: `addProject(input)`, `refreshProjects`

`addProject` persists manual entries to a JSON store (default `data/projects.local.json`).

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
| `PORT` | no | `4009` | HTTP listen port. |
| `HOST` | no | `0.0.0.0` | HTTP listen host. |

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
