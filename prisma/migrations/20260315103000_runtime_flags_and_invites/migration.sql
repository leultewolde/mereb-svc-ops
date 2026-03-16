CREATE TYPE "InviteCodeStatus" AS ENUM ('ACTIVE', 'DISABLED', 'REDEEMING', 'REDEEMED');

CREATE TABLE "RuntimeFlag" (
  "key" VARCHAR(64) NOT NULL,
  "description" VARCHAR(280),
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" VARCHAR(128),

  CONSTRAINT "RuntimeFlag_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "InviteCode" (
  "code" VARCHAR(64) NOT NULL,
  "email" VARCHAR(320),
  "label" VARCHAR(120),
  "note" VARCHAR(500),
  "status" "InviteCodeStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" VARCHAR(128),
  "redeemedAt" TIMESTAMP(3),
  "redeemedByUserId" VARCHAR(128),
  "redeemedEmail" VARCHAR(320),
  "redeemedDisplayName" VARCHAR(120),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "InviteCode_status_createdAt_idx" ON "InviteCode"("status", "createdAt");
CREATE INDEX "InviteCode_expiresAt_idx" ON "InviteCode"("expiresAt");
