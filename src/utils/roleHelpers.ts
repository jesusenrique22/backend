import { UserRole } from '../types/enums';

export function isSuperAdminRole(role: UserRole): boolean {
  return role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN;
}

export function isClinicAdminRole(role: UserRole): boolean {
  return role === UserRole.CLINIC_ADMIN;
}

export function isPharmacyAdminRole(role: UserRole): boolean {
  return role === UserRole.PHARMACY_ADMIN;
}

export function isPharmacyStaffRole(role: UserRole): boolean {
  return (
    role === UserRole.PHARMACY_ADMIN ||
    role === UserRole.PHARMACIST ||
    role === UserRole.PHARMACY_CASHIER
  );
}

/** Roles que no pueden auto-registrarse */
export const STAFF_ROLES: UserRole[] = [
  UserRole.DOCTOR,
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.PHARMACY_ADMIN,
  UserRole.PHARMACIST,
  UserRole.PHARMACY_CASHIER,
];
