-- Ambulance crew: paramedic and nurse assignments per unit
ALTER TABLE "ambulance_units" ADD COLUMN "paramedic_id" TEXT;
ALTER TABLE "ambulance_units" ADD COLUMN "nurse_id" TEXT;

ALTER TABLE "ambulance_units" ADD CONSTRAINT "ambulance_units_paramedic_id_fkey"
  FOREIGN KEY ("paramedic_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ambulance_units" ADD CONSTRAINT "ambulance_units_nurse_id_fkey"
  FOREIGN KEY ("nurse_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
