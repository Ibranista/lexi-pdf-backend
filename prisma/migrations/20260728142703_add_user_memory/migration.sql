-- CreateTable
CREATE TABLE "UserMemory" (
    "userId" TEXT NOT NULL,
    "style" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
