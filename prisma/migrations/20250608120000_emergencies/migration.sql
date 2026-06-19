-- Emergency module: ambulances, requests, chat, map coordinates

ALTER TABLE "medical_facilities" ADD COLUMN "has_emergency_room" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "pharmacies" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "pharmacies" ADD COLUMN "longitude" DOUBLE PRECISION;

ALTER TABLE "laboratories" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "laboratories" ADD COLUMN "longitude" DOUBLE PRECISION;

CREATE TABLE "ambulance_units" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "plate_number" TEXT NOT NULL,
    "call_sign" TEXT,
    "driver_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "last_seen_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ambulance_units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emergency_requests" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "ambulance_unit_id" TEXT,
    "origin_lat" DOUBLE PRECISION NOT NULL,
    "origin_lng" DOUBLE PRECISION NOT NULL,
    "origin_address" TEXT,
    "symptoms" TEXT,
    "pain_level" INTEGER,
    "medical_history" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "quoted_cost" DOUBLE PRECISION,
    "eta_minutes" INTEGER,
    "ambulance_lat" DOUBLE PRECISION,
    "ambulance_lng" DOUBLE PRECISION,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emergency_chat_messages" (
    "id" TEXT NOT NULL,
    "emergency_request_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transit_medical_logs" (
    "id" TEXT NOT NULL,
    "emergency_request_id" TEXT NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "blood_pressure" TEXT,
    "heart_rate" INTEGER,
    "saturation" INTEGER,
    "temperature" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transit_medical_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ambulance_units_facility_id_status_idx" ON "ambulance_units"("facility_id", "status");
CREATE INDEX "emergency_requests_patient_id_status_idx" ON "emergency_requests"("patient_id", "status");
CREATE INDEX "emergency_requests_facility_id_status_idx" ON "emergency_requests"("facility_id", "status");
CREATE INDEX "emergency_chat_messages_emergency_request_id_created_at_idx" ON "emergency_chat_messages"("emergency_request_id", "created_at");
CREATE INDEX "transit_medical_logs_emergency_request_id_created_at_idx" ON "transit_medical_logs"("emergency_request_id", "created_at");

ALTER TABLE "ambulance_units" ADD CONSTRAINT "ambulance_units_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "medical_facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ambulance_units" ADD CONSTRAINT "ambulance_units_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "emergency_requests" ADD CONSTRAINT "emergency_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emergency_requests" ADD CONSTRAINT "emergency_requests_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "medical_facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emergency_requests" ADD CONSTRAINT "emergency_requests_ambulance_unit_id_fkey" FOREIGN KEY ("ambulance_unit_id") REFERENCES "ambulance_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "emergency_chat_messages" ADD CONSTRAINT "emergency_chat_messages_emergency_request_id_fkey" FOREIGN KEY ("emergency_request_id") REFERENCES "emergency_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emergency_chat_messages" ADD CONSTRAINT "emergency_chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transit_medical_logs" ADD CONSTRAINT "transit_medical_logs_emergency_request_id_fkey" FOREIGN KEY ("emergency_request_id") REFERENCES "emergency_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transit_medical_logs" ADD CONSTRAINT "transit_medical_logs_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
