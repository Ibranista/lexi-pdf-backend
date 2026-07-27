-- DropForeignKey
ALTER TABLE "AiExplanation" DROP CONSTRAINT "AiExplanation_document_id_fkey";

-- DropForeignKey
ALTER TABLE "AiJob" DROP CONSTRAINT "AiJob_document_id_fkey";

-- DropForeignKey
ALTER TABLE "AiJob" DROP CONSTRAINT "AiJob_user_id_fkey";

-- DropForeignKey
ALTER TABLE "AiSummary" DROP CONSTRAINT "AiSummary_document_id_fkey";

-- DropForeignKey
ALTER TABLE "CardReview" DROP CONSTRAINT "CardReview_card_id_fkey";

-- DropForeignKey
ALTER TABLE "Collection" DROP CONSTRAINT "Collection_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "CollectionDocument" DROP CONSTRAINT "CollectionDocument_collection_id_fkey";

-- DropForeignKey
ALTER TABLE "CollectionDocument" DROP CONSTRAINT "CollectionDocument_document_id_fkey";

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_document_id_fkey";

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Devices" DROP CONSTRAINT "Devices_userId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "DocumentChunk" DROP CONSTRAINT "DocumentChunk_document_id_fkey";

-- DropForeignKey
ALTER TABLE "FocusSession" DROP CONSTRAINT "FocusSession_document_id_fkey";

-- DropForeignKey
ALTER TABLE "FocusSession" DROP CONSTRAINT "FocusSession_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Highlight" DROP CONSTRAINT "Highlight_document_id_fkey";

-- DropForeignKey
ALTER TABLE "Highlight" DROP CONSTRAINT "Highlight_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_conversation_id_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_user_id_fkey";

-- DropForeignKey
ALTER TABLE "MessageCitation" DROP CONSTRAINT "MessageCitation_message_id_fkey";

-- DropForeignKey
ALTER TABLE "Note" DROP CONSTRAINT "Note_document_id_fkey";

-- DropForeignKey
ALTER TABLE "Note" DROP CONSTRAINT "Note_highlight_id_fkey";

-- DropForeignKey
ALTER TABLE "Note" DROP CONSTRAINT "Note_user_id_fkey";

-- DropForeignKey
ALTER TABLE "ReadingProgress" DROP CONSTRAINT "ReadingProgress_document_id_fkey";

-- DropForeignKey
ALTER TABLE "ReadingProgress" DROP CONSTRAINT "ReadingProgress_user_id_fkey";

-- DropForeignKey
ALTER TABLE "ReviewCard" DROP CONSTRAINT "ReviewCard_document_id_fkey";

-- DropForeignKey
ALTER TABLE "ReviewCard" DROP CONSTRAINT "ReviewCard_highlight_id_fkey";

-- DropForeignKey
ALTER TABLE "ReviewCard" DROP CONSTRAINT "ReviewCard_user_id_fkey";

-- DropIndex
DROP INDEX "Document_owner_id_idx";

-- DropIndex
DROP INDEX "User_display_name_key";

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "author",
DROP COLUMN "file_size_bytes",
DROP COLUMN "imported_at",
DROP COLUMN "owner_id",
DROP COLUMN "page_count",
DROP COLUMN "storage_key",
DROP COLUMN "title",
ADD COLUMN     "bookmarks" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "collections" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "deletedAt" TIMESTAMPTZ,
ADD COLUMN     "docKey" TEXT NOT NULL,
ADD COLUMN     "ext" TEXT NOT NULL DEFAULT 'PDF',
ADD COLUMN     "lastDeviceId" TEXT,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "openedAt" TIMESTAMPTZ NOT NULL,
ADD COLUMN     "page" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pageCount" INTEGER,
ADD COLUMN     "readingPlanMs" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "readingTimeMsByPage" JSONB,
ADD COLUMN     "serverUpdatedAt" TIMESTAMPTZ NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ NOT NULL,
ADD COLUMN     "uri" TEXT NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "display_name",
DROP COLUMN "reading_level",
ADD COLUMN     "aiResetsAt" TIMESTAMPTZ,
ADD COLUMN     "aiTier" TEXT NOT NULL DEFAULT 'anonymous',
ADD COLUMN     "aiUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "name" SET DEFAULT '',
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "password" DROP NOT NULL;

-- DropTable
DROP TABLE "AiExplanation";

-- DropTable
DROP TABLE "AiJob";

-- DropTable
DROP TABLE "AiSummary";

-- DropTable
DROP TABLE "CardReview";

-- DropTable
DROP TABLE "Collection";

-- DropTable
DROP TABLE "CollectionDocument";

-- DropTable
DROP TABLE "Conversation";

-- DropTable
DROP TABLE "Devices";

-- DropTable
DROP TABLE "DocumentChunk";

-- DropTable
DROP TABLE "FocusSession";

-- DropTable
DROP TABLE "Highlight";

-- DropTable
DROP TABLE "Message";

-- DropTable
DROP TABLE "MessageCitation";

-- DropTable
DROP TABLE "Note";

-- DropTable
DROP TABLE "ReadingProgress";

-- DropTable
DROP TABLE "ReviewCard";

-- CreateTable
CREATE TABLE "Device" (
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT,
    "model" TEXT,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "locale" TEXT,
    "lastSyncedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "docKey" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT,
    "color" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,
    "serverUpdatedAt" TIMESTAMPTZ NOT NULL,
    "lastDeviceId" TEXT,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("userId","id")
);

-- CreateTable
CREATE TABLE "VocabEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "docKey" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "pos" TEXT,
    "tr" TEXT NOT NULL,
    "translit" TEXT,
    "lang" TEXT NOT NULL,
    "p" INTEGER,
    "s1" TEXT,
    "s2" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,
    "serverUpdatedAt" TIMESTAMPTZ NOT NULL,
    "lastDeviceId" TEXT,

    CONSTRAINT "VocabEntry_pkey" PRIMARY KEY ("userId","id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "docKey" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("userId","id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "kind" TEXT,
    "page" INTEGER,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentIndex" (
    "userId" TEXT NOT NULL,
    "docKey" TEXT NOT NULL,
    "title" TEXT,
    "author" TEXT,
    "pageCount" INTEGER,
    "pagesIndexed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "DocumentIndex_pkey" PRIMARY KEY ("userId","docKey")
);

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE INDEX "Annotation_userId_serverUpdatedAt_idx" ON "Annotation"("userId", "serverUpdatedAt");

-- CreateIndex
CREATE INDEX "Annotation_userId_docKey_idx" ON "Annotation"("userId", "docKey");

-- CreateIndex
CREATE INDEX "VocabEntry_userId_serverUpdatedAt_idx" ON "VocabEntry"("userId", "serverUpdatedAt");

-- CreateIndex
CREATE INDEX "VocabEntry_userId_docKey_idx" ON "VocabEntry"("userId", "docKey");

-- CreateIndex
CREATE INDEX "ChatSession_userId_docKey_idx" ON "ChatSession"("userId", "docKey");

-- CreateIndex
CREATE INDEX "ChatMessage_userId_sessionId_createdAt_idx" ON "ChatMessage"("userId", "sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_userId_serverUpdatedAt_idx" ON "Document"("userId", "serverUpdatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_userId_docKey_key" ON "Document"("userId", "docKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabEntry" ADD CONSTRAINT "VocabEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_sessionId_fkey" FOREIGN KEY ("userId", "sessionId") REFERENCES "ChatSession"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentIndex" ADD CONSTRAINT "DocumentIndex_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

