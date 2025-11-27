# svc-ops (control plane API)

Fastify + GraphQL service that inventories all Mereb projects (services, MFEs, packages, infra) and exposes metadata for dashboards. It seeds from `.gitmodules` and supports manual additions via GraphQL.

## Features (current)
- Loads project list from root `.gitmodules`, inferring type (service, MFE, package, infra, chart, misc).
- Manual project additions persisted to `data/projects.local.json` via `addProject` mutation.
- Keycloak-protected (OIDC issuer/audience required).

Planned next steps are outlined in `docs/ops-control-plane.md`.

## Running locally
```bash
pnpm --filter @services/svc-ops dev
```

Env vars (required):
- `OIDC_ISSUER` – Keycloak issuer URL
- `OIDC_AUDIENCE` – expected audience / client ID

Optional:
- `PORT` (default 4009)
- `HOST` (default 0.0.0.0)

## Example GraphQL queries
List all projects (gitmodules + manual):
```graphql
{
  projects {
    id
    name
    path
    repoUrl
    kind
    source
    jenkinsJob
  }
}
```

Add a manual project:
```graphql
mutation AddOpsProject {
  addProject(
    input: {
      name: "infra-admin"
      repoUrl: "git@github.com:example/infra-admin.git"
      path: "infra/admin"
      kind: INFRA
      tags: ["admin"]
    }
  ) {
    id
    name
    kind
    source
  }
}
```
