/*
  Warnings:

  - A unique constraint covering the columns `[display_name]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "display_name" TEXT,
ADD COLUMN     "reading_level" TEXT;

-- CreateTable
CREATE TABLE "Devices" (
    "device_id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Devices_pkey" PRIMARY KEY ("device_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_display_name_key" ON "User"("display_name");

-- AddForeignKey
ALTER TABLE "Devices" ADD CONSTRAINT "Devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
