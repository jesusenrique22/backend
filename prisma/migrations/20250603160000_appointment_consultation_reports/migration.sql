-- CreateTable
CREATE TABLE "appointment_consultation_reports" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "medications" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL,
    "no_medication" BOOLEAN NOT NULL DEFAULT false,
    "attachment_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "template_id" TEXT,
    "patient_acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_consultation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appointment_consultation_reports_appointment_id_key" ON "appointment_consultation_reports"("appointment_id");

-- AddForeignKey
ALTER TABLE "appointment_consultation_reports" ADD CONSTRAINT "appointment_consultation_reports_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
