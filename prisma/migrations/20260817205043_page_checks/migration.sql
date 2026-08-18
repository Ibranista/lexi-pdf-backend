-- AlterTable
ALTER TABLE "DocumentIndex" ADD COLUMN     "fiction" BOOLEAN;

-- CreateTable
CREATE TABLE "PageCheck" (
    "docKey" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "textHash" TEXT NOT NULL,
    "claims" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageCheck_pkey" PRIMARY KEY ("docKey","page","textHash")
);

-- CreateIndex
CREATE INDEX "PageCheck_docKey_idx" ON "PageCheck"("docKey");
