import {
  createOpsApplicationModule,
  type OpsApplicationModule
} from '../application/ops/use-cases.js';
import { GitmodulesProjectsSourceAdapter } from '../adapters/outbound/projects/gitmodules-project-source.js';
import { ManualProjectsStoreAdapter } from '../adapters/outbound/projects/manual-projects-store.js';
import { PrismaClient } from '../../generated/client/index.js';
import { PrismaRuntimeConfigStoreAdapter } from '../adapters/outbound/runtime/prisma-runtime-config-store.js';
import { KeycloakInviteProvisionerAdapter } from '../adapters/outbound/invites/keycloak-invite-provisioner.js';

export interface OpsContainer {
  ops: OpsApplicationModule;
}

function parseDefaultFlagsEnv(): Array<{ key: string; description?: string | null; enabled?: boolean }> {
  const raw = process.env.OPS_DEFAULT_FLAGS?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{ key: string; description?: string | null; enabled?: boolean }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    throw new Error(`OPS_DEFAULT_FLAGS must be valid JSON: ${(error as Error).message}`);
  }
}

export async function createContainer(): Promise<OpsContainer> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL env var required for svc-ops');
  }

  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });
  const runtimeStore = new PrismaRuntimeConfigStoreAdapter(db);

  const ops = createOpsApplicationModule({
    gitmodules: new GitmodulesProjectsSourceAdapter(),
    manualStore: new ManualProjectsStoreAdapter(),
    runtimeFlags: runtimeStore,
    inviteCodes: runtimeStore,
    inviteProvisioner: new KeycloakInviteProvisionerAdapter()
  });

  const defaultFlags = parseDefaultFlagsEnv();
  if (defaultFlags.length > 0) {
    await ops.commands.ensureDefaultFlags.execute(defaultFlags);
  }

  return {
    ops
  };
}
