-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- DropForeignKey
ALTER TABLE "Devices" DROP CONSTRAINT "Devices_userId_fkey";

-- AlterTable
ALTER TABLE "Devices" ADD COLUMN     "last_synced_at" TIMESTAMPTZ,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "platform" TEXT;

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "storage_key" TEXT NOT NULL,
    "page_count" INTEGER NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "imported_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionDocument" (
    "collection_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionDocument_pkey" PRIMARY KEY ("collection_id","document_id")
);

-- CreateTable
CREATE TABLE "ReadingProgress" (
    "user_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "current_page" INTEGER NOT NULL,
    "scroll_offset" DOUBLE PRECISION NOT NULL,
    "context_snippet" TEXT,
    "last_read_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingProgress_pkey" PRIMARY KEY ("user_id","document_id")
);

-- CreateTable
CREATE TABLE "FocusSession" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,
    "pages_read" INTEGER,

    CONSTRAINT "FocusSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "quoted_text" TEXT NOT NULL,
    "position" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "highlight_id" TEXT,
    "user_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSummary" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "page_from" INTEGER,
    "page_to" INTEGER,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiExplanation" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "source_text" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "reading_level" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiExplanation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageCitation" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "quoted_text" TEXT NOT NULL,

    CONSTRAINT "MessageCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewCard" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "highlight_id" TEXT,
    "user_id" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ NOT NULL,
    "interval_days" INTEGER NOT NULL DEFAULT 0,
    "ease_factor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardReview" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "reviewed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" SMALLINT NOT NULL,
    "next_due_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "CardReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiJob" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "payload" JSONB,
    "result_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "token_count" INTEGER,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_owner_id_idx" ON "Document"("owner_id");

-- CreateIndex
CREATE INDEX "Collection_owner_id_idx" ON "Collection"("owner_id");

-- CreateIndex
CREATE INDEX "CollectionDocument_document_id_idx" ON "CollectionDocument"("document_id");

-- CreateIndex
CREATE INDEX "ReadingProgress_document_id_idx" ON "ReadingProgress"("document_id");

-- CreateIndex
CREATE INDEX "FocusSession_user_id_idx" ON "FocusSession"("user_id");

-- CreateIndex
CREATE INDEX "FocusSession_document_id_idx" ON "FocusSession"("document_id");

-- CreateIndex
CREATE INDEX "Highlight_document_id_idx" ON "Highlight"("document_id");

-- CreateIndex
CREATE INDEX "Highlight_user_id_idx" ON "Highlight"("user_id");

-- CreateIndex
CREATE INDEX "Note_document_id_idx" ON "Note"("document_id");

-- CreateIndex
CREATE INDEX "Note_highlight_id_idx" ON "Note"("highlight_id");

-- CreateIndex
CREATE INDEX "Note_user_id_idx" ON "Note"("user_id");

-- CreateIndex
CREATE INDEX "AiSummary_document_id_idx" ON "AiSummary"("document_id");

-- CreateIndex
CREATE INDEX "AiExplanation_document_id_idx" ON "AiExplanation"("document_id");

-- CreateIndex
CREATE INDEX "Conversation_document_id_idx" ON "Conversation"("document_id");

-- CreateIndex
CREATE INDEX "Conversation_user_id_idx" ON "Conversation"("user_id");

-- CreateIndex
CREATE INDEX "Message_conversation_id_idx" ON "Message"("conversation_id");

-- CreateIndex
CREATE INDEX "Message_user_id_idx" ON "Message"("user_id");

-- CreateIndex
CREATE INDEX "MessageCitation_message_id_idx" ON "MessageCitation"("message_id");

-- CreateIndex
CREATE INDEX "ReviewCard_document_id_idx" ON "ReviewCard"("document_id");

-- CreateIndex
CREATE INDEX "ReviewCard_highlight_id_idx" ON "ReviewCard"("highlight_id");

-- CreateIndex
CREATE INDEX "ReviewCard_user_id_due_at_idx" ON "ReviewCard"("user_id", "due_at");

-- CreateIndex
CREATE INDEX "CardReview_card_id_idx" ON "CardReview"("card_id");

-- CreateIndex
CREATE INDEX "AiJob_user_id_idx" ON "AiJob"("user_id");

-- CreateIndex
CREATE INDEX "AiJob_document_id_idx" ON "AiJob"("document_id");

-- CreateIndex
CREATE INDEX "AiJob_status_idx" ON "AiJob"("status");

-- CreateIndex
CREATE INDEX "DocumentChunk_document_id_idx" ON "DocumentChunk"("document_id");

-- CreateIndex
CREATE INDEX "Devices_userId_idx" ON "Devices"("userId");

-- AddForeignKey
ALTER TABLE "Devices" ADD CONSTRAINT "Devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionDocument" ADD CONSTRAINT "CollectionDocument_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionDocument" ADD CONSTRAINT "CollectionDocument_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_highlight_id_fkey" FOREIGN KEY ("highlight_id") REFERENCES "Highlight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSummary" ADD CONSTRAINT "AiSummary_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiExplanation" ADD CONSTRAINT "AiExplanation_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageCitation" ADD CONSTRAINT "MessageCitation_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCard" ADD CONSTRAINT "ReviewCard_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCard" ADD CONSTRAINT "ReviewCard_highlight_id_fkey" FOREIGN KEY ("highlight_id") REFERENCES "Highlight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCard" ADD CONSTRAINT "ReviewCard_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardReview" ADD CONSTRAINT "CardReview_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "ReviewCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
