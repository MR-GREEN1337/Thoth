-- AlterTable
ALTER TABLE "Module" ADD COLUMN     "qualityScore" DOUBLE PRECISION,
ADD COLUMN     "revisionHistory" JSONB,
ADD COLUMN     "searchResults" JSONB,
ADD COLUMN     "youtubeUrls" TEXT[];

-- CreateTable
CREATE TABLE "CourseMessage" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isAI" BOOLEAN NOT NULL DEFAULT false,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "CourseMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseMessage_courseId_idx" ON "CourseMessage"("courseId");

-- CreateIndex
CREATE INDEX "CourseMessage_userId_idx" ON "CourseMessage"("userId");

-- CreateIndex
CREATE INDEX "CourseMessage_parentId_idx" ON "CourseMessage"("parentId");

-- AddForeignKey
ALTER TABLE "CourseMessage" ADD CONSTRAINT "CourseMessage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMessage" ADD CONSTRAINT "CourseMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMessage" ADD CONSTRAINT "CourseMessage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CourseMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
