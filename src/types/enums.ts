export enum UserRole {
  PATIENT = 'PATIENT',
  DOCTOR = 'DOCTOR',
  /** Jefe de la app — máxima jerarquía (legacy: ADMIN) */
  SUPER_ADMIN = 'SUPER_ADMIN',
  /** Administrador de una clínica/sede */
  CLINIC_ADMIN = 'CLINIC_ADMIN',
  /** Administrador de una farmacia */
  PHARMACY_ADMIN = 'PHARMACY_ADMIN',
  /** Farmacéutico — revisión de medicamentos */
  PHARMACIST = 'PHARMACIST',
  /** Cajero de farmacia */
  PHARMACY_CASHIER = 'PHARMACY_CASHIER',
  /** Técnico de laboratorio clínico */
  LAB_TECH = 'LAB_TECH',
  /** Conductor de ambulancia */
  AMBULANCE_DRIVER = 'AMBULANCE_DRIVER',
  /** Paramédico embarcado en ambulancia */
  PARAMEDIC = 'PARAMEDIC',
  /** Enfermero/a embarcado en ambulancia */
  AMBULANCE_NURSE = 'AMBULANCE_NURSE',
  /** @deprecated Usar SUPER_ADMIN */
  ADMIN = 'ADMIN',
}

export enum AmbulanceUnitStatus {
  AVAILABLE = 'AVAILABLE',
  DISPATCHED = 'DISPATCHED',
  ON_SCENE = 'ON_SCENE',
  TRANSPORTING = 'TRANSPORTING',
  MAINTENANCE = 'MAINTENANCE',
}

export enum EmergencyRequestStatus {
  REQUESTED = 'REQUESTED',
  DISPATCHED = 'DISPATCHED',
  ON_SCENE = 'ON_SCENE',
  PATIENT_ONBOARD = 'PATIENT_ONBOARD',
  EN_ROUTE = 'EN_ROUTE',
  ARRIVED = 'ARRIVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum AppointmentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum AppointmentType {
  ONLINE = 'ONLINE',
  PRESENTIAL = 'PRESENTIAL',
}

export enum DayOfWeek {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}

export enum PharmacyOrderStatus {
  PENDING = 'PENDING',
  REVIEWING = 'REVIEWING',
  READY = 'READY',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
