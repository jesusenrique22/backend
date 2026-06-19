-- CreateTable
CREATE TABLE "patient_medical_documents" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_medical_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_medical_documents_patient_id_created_at_idx" ON "patient_medical_documents"("patient_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "patient_medical_documents" ADD CONSTRAINT "patient_medical_documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
