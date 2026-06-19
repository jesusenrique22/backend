import '../loadEnv';

import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase, prisma } from '../config/db';
import {
  AppointmentStatus,
  AppointmentType,
  DayOfWeek,
  PharmacyOrderStatus,
  UserRole,
} from '../types/enums';
import type { MedicalFacility, Pharmacy, Specialty, User } from '@prisma/client';

const FRESH_SEED =
  process.argv.includes('--fresh') || process.env.SEED_FRESH === '1';
const CONFIRMED =
  process.argv.includes('--yes') || process.env.SEED_CONFIRM === '1';

function exitSeedUsage(code = 0) {
  console.log(`
Seed demo — no se ejecuta solo. Opciones:

  pnpm run db:seed -- --yes        Añade cuentas demo SIN borrar tus datos
  pnpm run db:seed:fresh           Reset total + demo (destructivo)

Pide explícitamente al agente o añade --yes cuando tú lo decidas.
`);
  process.exit(code);
}

async function clearDatabase() {
  await prisma.$transaction([
    prisma.equipmentRental.deleteMany(),
    prisma.medicalEquipment.deleteMany(),
    prisma.transitMedicalLog.deleteMany(),
    prisma.emergencyChatMessage.deleteMany(),
    prisma.emergencyRequest.deleteMany(),
    prisma.ambulanceUnit.deleteMany(),
    prisma.chatMessage.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.pharmacyOrder.deleteMany(),
    prisma.medicalHistoryEntry.deleteMany(),
    prisma.patientWeightControl.deleteMany(),
    prisma.chatConversation.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.clinicInvitation.deleteMany(),
    prisma.doctorWorkSchedule.deleteMany(),
    prisma.doctorProfileSpecialty.deleteMany(),
    prisma.doctorProfileFacility.deleteMany(),
    prisma.doctorSpecialtyDuration.deleteMany(),
    prisma.doctorProfile.deleteMany(),
    prisma.patientProfile.deleteMany(),
    prisma.medicalHistory.deleteMany(),
    prisma.pharmacyProduct.deleteMany(),
    prisma.user.deleteMany(),
    prisma.specialty.deleteMany(),
    prisma.medicalFacility.deleteMany(),
    prisma.pharmacy.deleteMany(),
    prisma.laboratory.deleteMany(),
  ]);
}

async function ensureSpecialty(name: string, description: string): Promise<Specialty> {
  return prisma.specialty.upsert({
    where: { name },
    create: { name, description },
    update: {},
  });
}

async function ensureFacility(data: {
  name: string;
  type: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  hasEmergencyRoom: boolean;
}): Promise<MedicalFacility> {
  const existing = await prisma.medicalFacility.findFirst({
    where: { name: data.name },
  });
  if (existing) return existing;
  return prisma.medicalFacility.create({ data });
}

async function ensurePharmacy(data: {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  logoUrl?: string;
}): Promise<Pharmacy> {
  const existing = await prisma.pharmacy.findFirst({ where: { name: data.name } });
  if (existing) return existing;
  return prisma.pharmacy.create({ data });
}

async function ensureLaboratory(data: {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  logoUrl?: string;
}) {
  const existing = await prisma.laboratory.findFirst({ where: { name: data.name } });
  if (existing) return existing;
  return prisma.laboratory.create({ data });
}

async function ensureDemoUser(
  email: string,
  data: Record<string, unknown>,
  passwordHash: string,
): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({
    data: { email, password: passwordHash, ...data } as Parameters<
      typeof prisma.user.create
    >[0]['data'],
  });
}

async function seed() {
  await connectDatabase();

  if (!CONFIRMED) {
    exitSeedUsage(0);
  }

  if (FRESH_SEED) {
    console.warn('⚠️  db:seed --fresh: borrando TODA la base de datos antes del seed demo.');
    await clearDatabase();
  } else {
    console.log('Seed seguro: se conservan usuarios y datos que ya existen.');
    console.log('(Reset total solo con: pnpm run db:seed:fresh)');
  }

  const password = await bcrypt.hash('password', 10);

  const specialties = await Promise.all([
    ensureSpecialty('Cardiología', 'Enfermedades del corazón'),
    ensureSpecialty('Medicina General', 'Atención primaria'),
    ensureSpecialty('Dermatología', 'Piel y anexos'),
    ensureSpecialty('Pediatría', 'Salud infantil'),
    ensureSpecialty('Ginecología y Obstetricia', 'Salud de la mujer y embarazo'),
    ensureSpecialty('Traumatología y Ortopedia', 'Lesiones y enfermedades de huesos y articulaciones'),
    ensureSpecialty('Oftalmología', 'Salud ocular y visión'),
    ensureSpecialty('Otorrinolaringología', 'Enfermedades de oído, nariz y garganta'),
    ensureSpecialty('Neurología', 'Sistema nervioso y cerebro'),
    ensureSpecialty('Gastroenterología', 'Sistema digestivo y estómago'),
    ensureSpecialty('Urología', 'Sistema urinario y aparato reproductor masculino'),
    ensureSpecialty('Psiquiatría', 'Salud mental y trastornos emocionales'),
    ensureSpecialty('Neumología', 'Vías respiratorias y pulmones'),
    ensureSpecialty('Endocrinología', 'Hormonas, metabolismo y diabetes'),
    ensureSpecialty('Oncología Médica', 'Prevención y tratamiento del cáncer'),
    ensureSpecialty('Nutrición Clínica', 'Alimentación, dieta y control metabólico'),
    ensureSpecialty('Alergología e Inmunología', 'Alergias y sistema inmunológico'),
    ensureSpecialty('Nefrología', 'Enfermedades y función de los riñones'),
    ensureSpecialty('Hematología', 'Trastornos de la sangre'),
    ensureSpecialty('Reumatología', 'Enfermedades autoinmunes y de articulaciones'),
    ensureSpecialty('Infectología', 'Enfermedades infecciosas y virus'),
    ensureSpecialty('Cirugía General', 'Procedimientos quirúrgicos generales'),
    ensureSpecialty('Anestesiología', 'Control del dolor y anestesia para procedimientos'),
    ensureSpecialty('Medicina Interna', 'Atención integral del adulto y enfermedades complejas'),
    ensureSpecialty('Odontología y Estomatología', 'Salud dental y bucal'),
    ensureSpecialty('Fisioterapia y Rehabilitación', 'Terapia física y recuperación motora'),
    ensureSpecialty('Geriatría', 'Salud y cuidado del adulto mayor'),
    ensureSpecialty('Medicina Estética', 'Tratamientos estéticos no invasivos'),
    ensureSpecialty('Radiología y Diagnóstico', 'Imágenes médicas (Rayos X, resonancias, ecografías)'),
    ensureSpecialty('Cardiología Infantil', 'Enfermedades cardíacas en niños'),
    ensureSpecialty('Medicina del Deporte', 'Lesiones deportivas y rendimiento físico'),
    ensureSpecialty('Psicología Clínica', 'Psicoterapia y orientación mental'),
  ]);

  const facilities = await Promise.all([
    ensureFacility({
      name: 'Clínica Metropolitana',
      type: 'CLINIC',
      address: 'Av. Andrés Bello, Caracas',
      city: 'Caracas',
      latitude: 10.485,
      longitude: -66.91,
      hasEmergencyRoom: true,
    }),
    ensureFacility({
      name: 'Hospital Central',
      type: 'HOSPITAL',
      address: 'Centro Médico, Caracas',
      city: 'Caracas',
      latitude: 10.435,
      longitude: -66.85,
      hasEmergencyRoom: true,
    }),
    ensureFacility({
      name: 'Consultorio Norte',
      type: 'CONSULTORY',
      address: 'Zona Norte, Valencia',
      city: 'Valencia',
      latitude: 10.18,
      longitude: -68.0,
      hasEmergencyRoom: false,
    }),
    ensureFacility({
      name: 'Clínica San José',
      type: 'CLINIC',
      address: 'Los Palos Grandes, Caracas',
      city: 'Caracas',
      latitude: 10.495,
      longitude: -66.84,
      hasEmergencyRoom: true,
    }),
  ]);

  const superAdmin = await ensureDemoUser(
    'admin@vita.com',
    {
      name: 'Super Admin VITA',
      role: UserRole.SUPER_ADMIN,
      phone: '+58 412-000-0001',
    },
    password,
  );

  const pharmacies = await Promise.all([
    ensurePharmacy({
      name: 'FarmaVita Central',
      address: 'Av. Libertador #123, Caracas',
      latitude: 10.49,
      longitude: -66.88,
      logoUrl:
        'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?auto=format&fit=crop&q=80&w=100',
    }),
    ensurePharmacy({
      name: 'EcoMedic Express',
      address: 'Calle 50 con Calle 72, Panamá',
      latitude: 10.48,
      longitude: -66.9,
      logoUrl:
        'https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&q=80&w=100',
    }),
  ]);

  const clinicAdmin = await ensureDemoUser(
    'clinic.admin@vita.com',
    {
      name: 'Admin Clínica Metropolitana',
      role: UserRole.CLINIC_ADMIN,
      phone: '+58 412-000-0002',
      managedFacilityId: facilities[0].id,
      createdById: superAdmin.id,
    },
    password,
  );

  const ambulanceDriver = await ensureDemoUser(
    'conductor@vita.com',
    {
      name: 'Carlos Ruiz',
      role: UserRole.AMBULANCE_DRIVER,
      phone: '+58 414-555-0199',
      managedFacilityId: facilities[0].id,
      createdById: clinicAdmin.id,
    },
    password,
  );

  const ambulanceParamedic = await ensureDemoUser(
    'paramedico@vita.com',
    {
      name: 'Ana Méndez',
      role: UserRole.PARAMEDIC,
      phone: '+58 414-555-0200',
      managedFacilityId: facilities[0].id,
      createdById: clinicAdmin.id,
    },
    password,
  );

  const ambulanceNurse = await ensureDemoUser(
    'enfermera@vita.com',
    {
      name: 'Laura Gómez',
      role: UserRole.AMBULANCE_NURSE,
      phone: '+58 414-555-0201',
      managedFacilityId: facilities[0].id,
      createdById: clinicAdmin.id,
    },
    password,
  );

  const ambulanceCount = await prisma.ambulanceUnit.count({
    where: { callSign: { in: ['VITA-04', 'VITA-07', 'VITA-12'] } },
  });
  if (ambulanceCount === 0) {
    await prisma.ambulanceUnit.createMany({
      data: [
        {
          facilityId: facilities[0].id,
          plateNumber: 'AA-123-VZ',
          callSign: 'VITA-04',
          driverId: ambulanceDriver.id,
          paramedicId: ambulanceParamedic.id,
          nurseId: ambulanceNurse.id,
          status: 'AVAILABLE',
          latitude: 10.482,
          longitude: -66.905,
        },
        {
          facilityId: facilities[0].id,
          plateNumber: 'BB-456-VZ',
          callSign: 'VITA-07',
          status: 'AVAILABLE',
          latitude: 10.486,
          longitude: -66.912,
        },
        {
          facilityId: facilities[1].id,
          plateNumber: 'CC-789-VZ',
          callSign: 'VITA-12',
          status: 'AVAILABLE',
          latitude: 10.438,
          longitude: -66.848,
        },
      ],
    });
  }

  await prisma.ambulanceUnit.updateMany({
    where: { callSign: 'VITA-04' },
    data: {
      driverId: ambulanceDriver.id,
      paramedicId: ambulanceParamedic.id,
      nurseId: ambulanceNurse.id,
    },
  });

  const pharmacyAdmin = await ensureDemoUser(
    'pharmacy.admin@vita.com',
    {
      name: 'Admin FarmaVita',
      role: UserRole.PHARMACY_ADMIN,
      phone: '+58 412-000-0003',
      pharmacyId: pharmacies[0].id,
      createdById: superAdmin.id,
    },
    password,
  );

  await ensureDemoUser(
    'farmacista@vita.com',
    {
      name: 'Ana Farmacéutica',
      role: UserRole.PHARMACIST,
      phone: '+58 412-000-0004',
      pharmacyId: pharmacies[0].id,
      createdById: pharmacyAdmin.id,
    },
    password,
  );

  await ensureDemoUser(
    'cajero@vita.com',
    {
      name: 'Luis Cajero',
      role: UserRole.PHARMACY_CASHIER,
      phone: '+58 412-000-0005',
      pharmacyId: pharmacies[0].id,
      createdById: pharmacyAdmin.id,
    },
    password,
  );

  const laboratories = await Promise.all([
    ensureLaboratory({
      name: 'BioLab Central',
      address: 'Av. Principal, Caracas',
      latitude: 10.478,
      longitude: -66.905,
      logoUrl:
        'https://images.unsplash.com/photo-1532187643603-ba119ca4109e?auto=format&fit=crop&q=80&w=600',
    }),
    ensureLaboratory({
      name: 'Lab Diagnóstico VITA',
      address: 'Centro Médico, Caracas',
      latitude: 10.44,
      longitude: -66.855,
    }),
  ]);

  await ensureDemoUser(
    'lab@tech.com',
    {
      name: 'Técnico Laboratorio VITA',
      role: UserRole.LAB_TECH,
      phone: '+58 412-000-0006',
      laboratoryId: laboratories[0].id,
      createdById: superAdmin.id,
    },
    password,
  );

  const products = await Promise.all([
    (async () => {
      const existing = await prisma.pharmacyProduct.findFirst({
        where: { pharmacyId: pharmacies[0].id, name: 'Amoxicilina 500mg' },
      });
      if (existing) return existing;
      return prisma.pharmacyProduct.create({
        data: {
          pharmacyId: pharmacies[0].id,
          name: 'Amoxicilina 500mg',
          brand: 'Genfar',
          category: 'Antibióticos',
          price: 12.5,
          stock: 80,
        },
      });
    })(),
    (async () => {
      const existing = await prisma.pharmacyProduct.findFirst({
        where: { pharmacyId: pharmacies[0].id, name: 'Ibuprofeno 400mg' },
      });
      if (existing) return existing;
      return prisma.pharmacyProduct.create({
        data: {
          pharmacyId: pharmacies[0].id,
          name: 'Ibuprofeno 400mg',
          brand: 'MK',
          category: 'Analgesicos',
          price: 8.0,
          stock: 120,
        },
      });
    })(),
    (async () => {
      const existing = await prisma.pharmacyProduct.findFirst({
        where: { pharmacyId: pharmacies[1].id, name: 'Losartán 50mg' },
      });
      if (existing) return existing;
      return prisma.pharmacyProduct.create({
        data: {
          pharmacyId: pharmacies[1].id,
          name: 'Losartán 50mg',
          brand: 'La Santé',
          category: 'Cardiovascular',
          price: 15.0,
          stock: 45,
        },
      });
    })(),
  ]);

  const orderCount = await prisma.pharmacyOrder.count({
    where: { pharmacyId: pharmacies[0].id },
  });
  if (orderCount === 0) {
    await prisma.pharmacyOrder.createMany({
      data: [
        {
          pharmacyId: pharmacies[0].id,
          productId: products[0].id,
          productName: products[0].name,
          quantity: 2,
          total: 25,
          status: PharmacyOrderStatus.COMPLETED,
        },
        {
          pharmacyId: pharmacies[0].id,
          productId: products[1].id,
          productName: products[1].name,
          quantity: 1,
          total: 8,
          status: PharmacyOrderStatus.PENDING,
        },
      ],
    });
  }

  const patient = await ensureDemoUser(
    'juan@patient.com',
    {
      name: 'Juan Pérez',
      role: UserRole.PATIENT,
      phone: '+58 412-555-0198',
      profilePic: 'https://i.pravatar.cc/150?img=1',
    },
    password,
  );

  await prisma.patientProfile.upsert({
    where: { userId: patient.id },
    create: {
      userId: patient.id,
      fullName: 'Juan Pérez',
      email: patient.email,
      phone: '+58 412-555-0198',
      documentId: 'V-12345678',
      birthDate: '1990-04-12',
      address: 'Av. Libertador, Caracas',
      emergencyContactName: 'María Pérez',
      emergencyContactPhone: '+58 414-555-0142',
      bloodType: 'O+',
      allergies: 'Penicilina',
      chronicConditions: 'Hipertensión controlada',
      currentMedications: 'Losartán 50mg diario',
      surgeries: 'Apendicectomía 2014',
      weightKg: '78',
      heightCm: '176',
      insuranceProvider: 'Seguros Mercantil',
      policyNumber: 'MC-2024-889900',
    },
    update: {},
  });

  const history = await prisma.medicalHistory.upsert({
    where: { patientId: patient.id },
    create: {
      patientId: patient.id,
      bloodType: 'O+',
      allergies: 'Penicilina',
      chronicConditions: 'Hipertensión controlada',
      currentMedications: 'Losartán 50mg diario',
      surgeries: 'Apendicectomía 2014',
      weightKg: '78',
      heightCm: '176',
    },
    update: {},
  });

  const entryCount = await prisma.medicalHistoryEntry.count({
    where: { medicalHistoryId: history.id },
  });
  if (entryCount === 0) {
    await prisma.medicalHistoryEntry.create({
      data: {
        medicalHistoryId: history.id,
        date: new Date('2025-11-10'),
        title: 'Control de presión',
        description: 'Presión arterial dentro de rango normal.',
        diagnosis: 'Hipertensión controlada',
        treatment: 'Continuar Losartán 50mg',
      },
    });
  }

  const doctor = await ensureDemoUser(
    'maria@doctor.com',
    {
      name: 'Dra. María Gómez',
      role: UserRole.DOCTOR,
      phone: '+58 414-555-0200',
      profilePic: 'https://i.pravatar.cc/150?img=2',
    },
    password,
  );

  let doctorProfile = await prisma.doctorProfile.findUnique({
    where: { userId: doctor.id },
  });
  if (!doctorProfile) {
    doctorProfile = await prisma.doctorProfile.create({
      data: {
        userId: doctor.id,
        documentId: 'V-87654321',
        licenseNumber: 'MED-45821',
        bio: 'Cardióloga con 12 años de experiencia',
        rating: 4.9,
        consultationPriceOnline: 25,
        consultationPricePresential: 45,
        specialties: {
          create: [
            { specialtyId: specialties[0].id },
            { specialtyId: specialties[1].id },
          ],
        },
        facilities: {
          create: [{ facilityId: facilities[0].id }, { facilityId: facilities[1].id }],
        },
        specialtyDurations: {
          create: [
            { specialtyId: specialties[0].id, durationMinutes: 60 },
            { specialtyId: specialties[1].id, durationMinutes: 30 },
          ],
        },
      },
    });
  }

  const scheduleCount = await prisma.doctorWorkSchedule.count({
    where: { doctorId: doctor.id },
  });
  if (scheduleCount === 0) {
    const weekdays = [
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
      DayOfWeek.SATURDAY,
    ];
    await prisma.doctorWorkSchedule.createMany({
      data: weekdays.flatMap((day) => [
        {
          doctorId: doctor.id,
          facilityId: facilities[0].id,
          dayOfWeek: day,
          startTime: '08:00',
          endTime: '12:00',
        },
        {
          doctorId: doctor.id,
          facilityId: facilities[1].id,
          dayOfWeek: day,
          startTime: '14:00',
          endTime: '18:00',
        },
      ]),
    });
  }

  const appointmentCount = await prisma.appointment.count({
    where: { patientId: patient.id, doctorId: doctor.id },
  });
  if (appointmentCount === 0) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 30, 0, 0);

    await prisma.appointment.createMany({
      data: [
        {
          patientId: patient.id,
          doctorId: doctor.id,
          facilityId: facilities[1].id,
          specialtyId: specialties[0].id,
          dateTime: tomorrow,
          status: AppointmentStatus.PENDING,
          type: AppointmentType.PRESENTIAL,
          reason: 'Control cardiológico',
          price: 45,
          durationMinutes: 60,
        },
        {
          patientId: patient.id,
          doctorId: doctor.id,
          specialtyId: specialties[0].id,
          dateTime: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
          status: AppointmentStatus.CONFIRMED,
          type: AppointmentType.ONLINE,
          reason: 'Seguimiento telemedicina',
          price: 25,
          durationMinutes: 60,
        },
      ],
    });
  }

  const chatExists = await prisma.chatConversation.findFirst({
    where: { doctorId: doctor.id, patientId: patient.id },
  });
  if (!chatExists) {
    await prisma.chatConversation.create({
      data: {
        doctorId: doctor.id,
        patientId: patient.id,
        lastMessage: 'Buenos días doctor, tengo una consulta sobre mi medicación.',
        lastMessageAt: new Date(),
        lastChatMessage: 'Buenos días doctor, tengo una consulta sobre mi medicación.',
        lastChatMessageAt: new Date(),
      },
    });
  }

  // Seed medical equipment
  const equipmentCount = await prisma.medicalEquipment.count();
  if (equipmentCount === 0) {
    await prisma.medicalEquipment.createMany({
      data: [
        {
          facilityId: facilities[0].id,
          name: 'Silla de Ruedas Ergonómica',
          description: 'Silla de ruedas ajustable, plegable y liviana con frenos de mano y tapicería lavable.',
          pricePerDay: 12.0,
          stock: 5,
          imageUrl: 'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&q=80&w=200',
        },
        {
          facilityId: facilities[0].id,
          name: 'Concentrador de Oxígeno 5L',
          description: 'Concentrador de oxígeno portátil de flujo continuo hasta 5 litros por minuto, ideal para terapias respiratorias en casa.',
          pricePerDay: 35.0,
          stock: 3,
          imageUrl: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&q=80&w=200',
        },
        {
          facilityId: facilities[0].id,
          name: 'Muletas de Aluminio (Par)',
          description: 'Muletas de aluminio regulables en altura con almohadillas axilares de goma suave para mayor soporte.',
          pricePerDay: 4.5,
          stock: 10,
          imageUrl: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&q=80&w=200',
        },
        {
          facilityId: facilities[1].id,
          name: 'Cama Clínica Eléctrica de 3 Funciones',
          description: 'Cama hospitalaria eléctrica con inclinación de cabecera, piecera y altura regulable. Incluye colchón clínico.',
          pricePerDay: 45.0,
          stock: 2,
          imageUrl: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&q=80&w=200',
        },
        {
          facilityId: facilities[1].id,
          name: 'Nebulizador Compresor Portátil',
          description: 'Nebulizador de compresor de alta eficiencia para la administración rápida de medicamentos respiratorios.',
          pricePerDay: 7.0,
          stock: 6,
          imageUrl: 'https://images.unsplash.com/photo-1584515980126-de26e84d47c3?auto=format&fit=crop&q=80&w=200',
        },
      ],
    });
  }

  console.log('Seed completado (PostgreSQL):');
  console.log(`  Modo: ${FRESH_SEED ? 'RESET TOTAL (--fresh)' : 'seguro (datos existentes conservados)'}`);
  console.log(`  Super Admin:    ${superAdmin.email} / password`);
  console.log(`  Admin Clínica:  ${clinicAdmin.email} / password`);
  console.log(`  Admin Farmacia: ${pharmacyAdmin.email} / password`);
  console.log(`  Farmacéutico:   farmacista@vita.com / password`);
  console.log(`  Cajero:         cajero@vita.com / password`);
  console.log(`  Paciente: ${patient.email} / password`);
  console.log(`  Doctor:  ${doctor.email} / password`);
  console.log(`  Especialidades: ${specialties.length}`);
  console.log(`  Sedes: ${facilities.length}`);
  console.log(`  Perfil doctor: ${doctorProfile.id}`);

  await disconnectDatabase();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
