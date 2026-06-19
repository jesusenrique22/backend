import { prisma } from '../lib/prisma';
import { UserRole } from '../types/enums';

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
};

export async function ensurePatientProfile(user: UserRow) {
  const existing = await prisma.patientProfile.findUnique({
    where: { userId: user.id },
  });
  if (existing) return existing;

  const profile = await prisma.patientProfile.create({
    data: {
      userId: user.id,
      fullName: user.name,
      email: user.email,
      phone: user.phone ?? undefined,
    },
  });

  await prisma.medicalHistory.upsert({
    where: { patientId: user.id },
    create: { patientId: user.id },
    update: {},
  });

  return profile;
}

export async function ensureDoctorProfile(user: UserRow) {
  const existing = await prisma.doctorProfile.findUnique({
    where: { userId: user.id },
  });
  if (existing) return existing;

  const suffix = user.id.slice(-8).toUpperCase();
  let documentId = `MIG-${suffix}`;
  let attempt = 0;
  while (attempt < 5) {
    const clash = await prisma.doctorProfile.findUnique({
      where: { documentId },
    });
    if (!clash) break;
    attempt += 1;
    documentId = `MIG-${suffix}-${attempt}`;
  }

  return prisma.doctorProfile.create({
    data: {
      userId: user.id,
      documentId,
      bio: 'Perfil migrado — completa especialidad y clínica desde administración.',
    },
  });
}

export async function ensureProfilesForUser(user: UserRow) {
  if (user.role === UserRole.PATIENT) {
    await ensurePatientProfile(user);
    return;
  }
  if (user.role === UserRole.DOCTOR) {
    await ensureDoctorProfile(user);
  }
}

export async function backfillAllMissingProfiles() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, phone: true, role: true },
  });

  let createdPatients = 0;
  let createdDoctors = 0;

  for (const user of users) {
    if (user.role === UserRole.PATIENT) {
      const before = await prisma.patientProfile.findUnique({
        where: { userId: user.id },
      });
      if (!before) {
        await ensurePatientProfile(user);
        createdPatients += 1;
        console.log(`+ patient_profile: ${user.email}`);
      }
      continue;
    }
    if (user.role === UserRole.DOCTOR) {
      const before = await prisma.doctorProfile.findUnique({
        where: { userId: user.id },
      });
      if (!before) {
        await ensureDoctorProfile(user);
        createdDoctors += 1;
        console.log(`+ doctor_profile: ${user.email}`);
      }
    }
  }

  return { createdPatients, createdDoctors, totalUsers: users.length };
}
