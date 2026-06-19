-- AlterTable
ALTER TABLE "appointment_consultation_reports" ADD COLUMN "follow_up_date" TIMESTAMP(3),
ADD COLUMN "follow_up_note" TEXT;

-- CreateIndex
CREATE INDEX "appointment_consultation_reports_follow_up_date_idx" ON "appointment_consultation_reports"("follow_up_date");

-- CreateTable
CREATE TABLE "doctor_consultation_templates" (
    "id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "findings_hint" TEXT,
    "diagnosis_hint" TEXT,
    "medications_hint" TEXT,
    "instructions_hint" TEXT,
    "default_no_medication" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_consultation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_consultation_templates_doctor_id_sort_order_idx" ON "doctor_consultation_templates"("doctor_id", "sort_order");

-- AddForeignKey
ALTER TABLE "doctor_consultation_templates" ADD CONSTRAINT "doctor_consultation_templates_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
