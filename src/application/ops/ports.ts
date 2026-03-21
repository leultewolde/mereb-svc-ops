import type { ManualProjectInput, Project } from '../../domain/ops/projects.js';
import type {
  CreateInviteCodeInput,
  CreateRuntimeFlagInput,
  DefaultRuntimeFlag,
  InviteCode,
  InviteEmailDelivery,
  RedeemInviteInput,
  RuntimeFlag,
  RuntimeFlagsPayload,
  UpdateRuntimeFlagInput
} from '../../domain/ops/runtime-config.js';

export interface GitmoduleProjectsSourcePort {
  loadProjects(): Promise<Project[]>;
}

export interface ManualProjectsStorePort {
  loadProjects(): Promise<Project[]>;
  addProject(input: ManualProjectInput): Promise<Project>;
}

export interface RuntimeFlagsStorePort {
  listRuntimeFlags(): Promise<RuntimeFlag[]>;
  getPublicFlags(): Promise<RuntimeFlagsPayload>;
  createRuntimeFlag(input: CreateRuntimeFlagInput, actorId: string): Promise<RuntimeFlag>;
  updateRuntimeFlag(key: string, input: UpdateRuntimeFlagInput, actorId: string): Promise<RuntimeFlag>;
  deleteRuntimeFlag(key: string): Promise<boolean>;
  ensureRuntimeFlags(flags: DefaultRuntimeFlag[]): Promise<void>;
}

export interface InviteCodesStorePort {
  listInviteCodes(): Promise<InviteCode[]>;
  getInviteCode(code: string): Promise<InviteCode | null>;
  createInviteCode(input: CreateInviteCodeInput, actorId: string): Promise<InviteCode>;
  disableInviteCode(code: string, actorId: string): Promise<InviteCode>;
  deleteInviteCode(code: string): Promise<boolean>;
  beginRedeemInvite(input: RedeemInviteInput): Promise<InviteCode>;
  completeRedeemInvite(code: string, result: {
    userId: string;
    email: string;
    displayName: string;
  }): Promise<void>;
  cancelRedeemInvite(code: string): Promise<void>;
}

export interface InviteProvisionerPort {
  createUser(input: RedeemInviteInput): Promise<{ userId: string }>;
}

export interface InviteEmailSenderPort {
  sendInviteCodeEmail(invite: InviteCode & { email: string }): Promise<InviteEmailDelivery>;
}
