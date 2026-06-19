-- Perfil extendido para conductor, paramédico y enfermero de ambulancia
CREATE TABLE "ambulance_staff_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "license_number" TEXT,
    "certification" TEXT,
    "bio" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ambulance_staff_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ambulance_staff_profiles_user_id_key" ON "ambulance_staff_profiles"("user_id");

ALTER TABLE "ambulance_staff_profiles" ADD CONSTRAINT "ambulance_staff_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
