-- CreateTable
CREATE TABLE "CourseFork" (
    "id" TEXT NOT NULL,
    "originalCourseId" TEXT NOT NULL,
    "forkedCourseId" TEXT NOT NULL,
    "forkerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseFork_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseFork_originalCourseId_idx" ON "CourseFork"("originalCourseId");

-- CreateIndex
CREATE INDEX "CourseFork_forkedCourseId_idx" ON "CourseFork"("forkedCourseId");

-- CreateIndex
CREATE INDEX "CourseFork_forkerId_idx" ON "CourseFork"("forkerId");

-- AddForeignKey
ALTER TABLE "CourseFork" ADD CONSTRAINT "CourseFork_originalCourseId_fkey" FOREIGN KEY ("originalCourseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseFork" ADD CONSTRAINT "CourseFork_forkedCourseId_fkey" FOREIGN KEY ("forkedCourseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseFork" ADD CONSTRAINT "CourseFork_forkerId_fkey" FOREIGN KEY ("forkerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
