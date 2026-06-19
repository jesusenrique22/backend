/**
 * Migra TODAS las colecciones de MongoDB a PostgreSQL preservando ObjectId como id.
 * Requiere: MONGODB_URI y DATABASE_URL en .env
 *
 * Uso: pnpm run db:migrate-mongo
 */
import '../loadEnv';

import mongoose from 'mongoose';
import { prisma } from '../lib/prisma';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smartmedic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MongoDoc = Record<string, any>;

const stats: Record<string, { ok: number; skip: number }> = {};

function bump(key: string, ok: boolean) {
  if (!stats[key]) stats[key] = { ok: 0, skip: 0 };
  if (ok) stats[key].ok++;
  else stats[key].skip++;
}

function oid(doc: { _id: mongoose.Types.ObjectId }): string {
  return doc._id.toString();
}

function ref(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'object' && value !== null && '_id' in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

function date(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value) return new Date(value as string);
  return new Date();
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  await prisma.$connect();
  const db = mongoose.connection.db!;
  console.log(`Conectado a MongoDB (${mongoose.connection.name}) y PostgreSQL\n`);

  // ── 1. Catálogos base ──────────────────────────────────────────────
  const specialties = await db.collection('specialties').find().toArray();
  for (const s of specialties) {
    try {
      await prisma.specialty.upsert({
        where: { id: oid(s) },
        create: {
          id: oid(s),
          name: s.name,
          description: s.description,
          createdAt: date(s.createdAt),
          updatedAt: date(s.updatedAt),
        },
        update: { name: s.name, description: s.description },
      });
      bump('specialties', true);
    } catch (e) {
      console.warn('specialty:', oid(s), (e as Error).message);
      bump('specialties', false);
    }
  }

  const facilities = await db.collection('medical_facilities').find().toArray();
  for (const f of facilities) {
    try {
      await prisma.medicalFacility.upsert({
        where: { id: oid(f) },
        create: {
          id: oid(f),
          name: f.name,
          type: f.type ?? 'CLINIC',
          address: f.address,
          city: f.city,
          phone: f.phone,
          latitude: f.latitude,
          longitude: f.longitude,
          isActive: f.isActive ?? true,
          serviceEnabled: f.serviceEnabled ?? true,
          createdAt: date(f.createdAt),
          updatedAt: date(f.updatedAt),
        },
        update: {},
      });
      bump('medical_facilities', true);
    } catch (e) {
      console.warn('facility:', oid(f), (e as Error).message);
      bump('medical_facilities', false);
    }
  }

  const pharmacies = await db.collection('pharmacies').find().toArray();
  for (const p of pharmacies) {
    try {
      await prisma.pharmacy.upsert({
        where: { id: oid(p) },
        create: {
          id: oid(p),
          name: p.name,
          address: p.address,
          logoUrl: p.logoUrl,
          phone: p.phone,
          isActive: p.isActive ?? true,
          serviceEnabled: p.serviceEnabled ?? true,
          createdAt: date(p.createdAt),
          updatedAt: date(p.updatedAt),
        },
        update: {},
      });
      bump('pharmacies', true);
    } catch (e) {
      console.warn('pharmacy:', oid(p), (e as Error).message);
      bump('pharmacies', false);
    }
  }

  // ── 2. Usuarios ────────────────────────────────────────────────────
  const users = await db.collection('users').find().toArray();
  for (const u of users) {
    try {
      await prisma.user.upsert({
        where: { id: oid(u) },
        create: {
          id: oid(u),
          email: String(u.email).toLowerCase().trim(),
          password: u.password,
          name: u.name,
          role: u.role,
          phone: u.phone,
          profilePic: u.profilePic,
          managedFacilityId: ref(u.managedFacilityId),
          pharmacyId: ref(u.pharmacyId),
          isActive: u.isActive ?? true,
          createdById: ref(u.createdBy),
          createdAt: date(u.createdAt),
          updatedAt: date(u.updatedAt),
        },
        update: {
          email: String(u.email).toLowerCase().trim(),
          name: u.name,
          role: u.role,
          phone: u.phone,
          profilePic: u.profilePic,
          managedFacilityId: ref(u.managedFacilityId),
          pharmacyId: ref(u.pharmacyId),
          isActive: u.isActive ?? true,
        },
      });
      bump('users', true);
    } catch (e) {
      console.warn('user:', u.email, (e as Error).message);
      bump('users', false);
    }
  }

  // ── 3. Perfiles médicos + relaciones ─────────────────────────────────
  const doctorProfiles = await db.collection('doctor_profiles').find().toArray();
  for (const dp of doctorProfiles) {
    const profileId = oid(dp);
    const userId = ref(dp.userId);
    if (!userId) {
      bump('doctor_profiles', false);
      continue;
    }
    try {
      await prisma.doctorProfile.upsert({
        where: { id: profileId },
        create: {
          id: profileId,
          userId,
          documentId: dp.documentId || null,
          licenseNumber: dp.licenseNumber,
          bio: dp.bio,
          rating: dp.rating ?? 5,
          ratingCount: dp.ratingCount ?? 0,
          consultationPriceOnline: dp.consultationPriceOnline ?? 25,
          consultationPricePresential: dp.consultationPricePresential ?? 45,
          defaultConsultationMinutes: dp.defaultConsultationMinutes ?? 30,
          createdAt: date(dp.createdAt),
          updatedAt: date(dp.updatedAt),
        },
        update: {
          documentId: dp.documentId || null,
          licenseNumber: dp.licenseNumber,
          bio: dp.bio,
          rating: dp.rating ?? 5,
          ratingCount: dp.ratingCount ?? 0,
        },
      });
      bump('doctor_profiles', true);
    } catch (e) {
      console.warn('doctor_profile:', profileId, (e as Error).message);
      bump('doctor_profiles', false);
      continue;
    }

    for (const sid of dp.specialtyIds ?? []) {
      const specialtyId = ref(sid);
      if (!specialtyId) continue;
      try {
        await prisma.doctorProfileSpecialty.upsert({
          where: {
            doctorProfileId_specialtyId: { doctorProfileId: profileId, specialtyId },
          },
          create: { doctorProfileId: profileId, specialtyId },
          update: {},
        });
      } catch {
        /* FK huérfana */
      }
    }

    for (const fid of dp.facilityIds ?? []) {
      const facilityId = ref(fid);
      if (!facilityId) continue;
      try {
        await prisma.doctorProfileFacility.upsert({
          where: {
            doctorProfileId_facilityId: { doctorProfileId: profileId, facilityId },
          },
          create: { doctorProfileId: profileId, facilityId },
          update: {},
        });
      } catch {
        /* FK huérfana */
      }
    }

    for (const d of dp.specialtyConsultationDurations ?? []) {
      const specialtyId = ref(d.specialtyId);
      if (!specialtyId) continue;
      try {
        await prisma.doctorSpecialtyDuration.upsert({
          where: {
            doctorProfileId_specialtyId: { doctorProfileId: profileId, specialtyId },
          },
          create: {
            doctorProfileId: profileId,
            specialtyId,
            durationMinutes: d.durationMinutes ?? 30,
          },
          update: { durationMinutes: d.durationMinutes ?? 30 },
        });
      } catch {
        /* FK huérfana */
      }
    }
  }

  // ── 4. Perfiles paciente + controles de peso ───────────────────────
  const patientProfiles = await db.collection('patient_profiles').find().toArray();
  for (const pp of patientProfiles) {
    const profileId = oid(pp);
    const userId = ref(pp.userId);
    if (!userId) {
      bump('patient_profiles', false);
      continue;
    }
    try {
      await prisma.patientProfile.upsert({
        where: { id: profileId },
        create: {
          id: profileId,
          userId,
          fullName: pp.fullName,
          email: pp.email,
          phone: pp.phone,
          documentId: pp.documentId,
          birthDate: pp.birthDate,
          address: pp.address,
          emergencyContactName: pp.emergencyContactName,
          emergencyContactPhone: pp.emergencyContactPhone,
          referredBy: pp.referredBy,
          maritalStatus: pp.maritalStatus,
          occupation: pp.occupation,
          bloodType: pp.bloodType,
          allergies: pp.allergies,
          chronicConditions: pp.chronicConditions,
          currentMedications: pp.currentMedications,
          surgeries: pp.surgeries,
          weightKg: pp.weightKg,
          heightCm: pp.heightCm,
          obesityType: pp.obesityType,
          recommendedSurgery: pp.recommendedSurgery,
          vaccines: pp.vaccines,
          hasHypertension: pp.hasHypertension ?? false,
          hasDiabetes: pp.hasDiabetes ?? false,
          hasBronchialAsthma: pp.hasBronchialAsthma ?? false,
          isSmoker: pp.isSmoker ?? false,
          covidSeverity: pp.covidSeverity ?? 'NONE',
          observations: pp.observations,
          insuranceProvider: pp.insuranceProvider,
          policyNumber: pp.policyNumber,
          medicalHistoryCompleted: pp.medicalHistoryCompleted ?? false,
          createdAt: date(pp.createdAt),
          updatedAt: date(pp.updatedAt),
        },
        update: { fullName: pp.fullName, email: pp.email },
      });
      bump('patient_profiles', true);

      await prisma.patientWeightControl.deleteMany({ where: { patientProfileId: profileId } });
      const controls: MongoDoc[] = pp.weightControls ?? [];
      if (controls.length) {
        await prisma.patientWeightControl.createMany({
          data: controls.map((w, i) => ({
            patientProfileId: profileId,
            sortOrder: i,
            weightKg: w.weightKg,
            fatPercent: w.fatPercent,
            visceral: w.visceral,
            muscleKg: w.muscleKg,
            bmi: w.bmi,
            doseDate: w.doseDate,
            dose: w.dose,
          })),
          skipDuplicates: true,
        });
        bump('patient_weight_controls', true);
      }
    } catch (e) {
      console.warn('patient_profile:', profileId, (e as Error).message);
      bump('patient_profiles', false);
    }
  }

  // ── 5. Historiales médicos + entradas ────────────────────────────────
  const histories = await db.collection('medical_histories').find().toArray();
  for (const h of histories) {
    const historyId = oid(h);
    const patientId = ref(h.patientId);
    if (!patientId) {
      bump('medical_histories', false);
      continue;
    }
    try {
      await prisma.medicalHistory.upsert({
        where: { id: historyId },
        create: {
          id: historyId,
          patientId,
          bloodType: h.bloodType,
          allergies: h.allergies,
          chronicConditions: h.chronicConditions,
          currentMedications: h.currentMedications,
          surgeries: h.surgeries,
          weightKg: h.weightKg,
          heightCm: h.heightCm,
          createdAt: date(h.createdAt),
          updatedAt: date(h.updatedAt),
        },
        update: {},
      });
      bump('medical_histories', true);

      await prisma.medicalHistoryEntry.deleteMany({ where: { medicalHistoryId: historyId } });
      const entries: MongoDoc[] = h.entries ?? [];
      for (const e of entries) {
        const entryId = e._id ? e._id.toString() : undefined;
        try {
          await prisma.medicalHistoryEntry.create({
            data: {
              ...(entryId ? { id: entryId } : {}),
              medicalHistoryId: historyId,
              date: date(e.date),
              doctorId: ref(e.doctorId),
              title: e.title ?? 'Consulta',
              description: e.description ?? '',
              diagnosis: e.diagnosis,
              treatment: e.treatment,
              attachments: e.attachments ?? [],
              createdAt: date(e.date),
            },
          });
          bump('medical_history_entries', true);
        } catch (err) {
          bump('medical_history_entries', false);
        }
      }
    } catch (e) {
      console.warn('medical_history:', historyId, (e as Error).message);
      bump('medical_histories', false);
    }
  }

  // ── 6. Horarios médicos ──────────────────────────────────────────────
  const schedules = await db.collection('doctor_work_schedules').find().toArray();
  for (const s of schedules) {
    try {
      await prisma.doctorWorkSchedule.upsert({
        where: { id: oid(s) },
        create: {
          id: oid(s),
          doctorId: ref(s.doctorId)!,
          facilityId: ref(s.facilityId)!,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          isActive: s.isActive ?? true,
          createdAt: date(s.createdAt),
          updatedAt: date(s.updatedAt),
        },
        update: {},
      });
      bump('doctor_work_schedules', true);
    } catch (e) {
      console.warn('schedule:', oid(s), (e as Error).message);
      bump('doctor_work_schedules', false);
    }
  }

  // ── 7. Citas ─────────────────────────────────────────────────────────
  const appointments = await db.collection('appointments').find().toArray();
  for (const a of appointments) {
    try {
      await prisma.appointment.upsert({
        where: { id: oid(a) },
        create: {
          id: oid(a),
          patientId: ref(a.patientId)!,
          doctorId: ref(a.doctorId)!,
          facilityId: ref(a.facilityId),
          specialtyId: ref(a.specialtyId),
          dateTime: date(a.dateTime),
          endTime: a.endTime ? date(a.endTime) : null,
          durationMinutes: a.durationMinutes ?? 30,
          status: a.status ?? 'PENDING',
          type: a.type,
          notes: a.notes,
          reason: a.reason,
          price: a.price ?? 0,
          patientRating: a.patientRating,
          patientReview: a.patientReview,
          ratedAt: a.ratedAt ? date(a.ratedAt) : null,
          createdAt: date(a.createdAt),
          updatedAt: date(a.updatedAt),
        },
        update: {},
      });
      bump('appointments', true);
    } catch (e) {
      console.warn('appointment:', oid(a), (e as Error).message);
      bump('appointments', false);
    }
  }

  // ── 8. Invitaciones clínica ──────────────────────────────────────────
  const invitations = await db.collection('clinic_invitations').find().toArray();
  for (const inv of invitations) {
    try {
      await prisma.clinicInvitation.upsert({
        where: { id: oid(inv) },
        create: {
          id: oid(inv),
          doctorId: ref(inv.doctorId)!,
          facilityId: ref(inv.facilityId)!,
          invitedByUserId: ref(inv.invitedByUserId)!,
          status: inv.status ?? 'PENDING',
          respondedAt: inv.respondedAt ? date(inv.respondedAt) : null,
          createdAt: date(inv.createdAt),
          updatedAt: date(inv.updatedAt),
        },
        update: { status: inv.status },
      });
      bump('clinic_invitations', true);
    } catch (e) {
      console.warn('clinic_invitation:', oid(inv), (e as Error).message);
      bump('clinic_invitations', false);
    }
  }

  // ── 9. Chat ──────────────────────────────────────────────────────────
  const conversations = await db.collection('chat_conversations').find().toArray();
  for (const c of conversations) {
    try {
      await prisma.chatConversation.upsert({
        where: { id: oid(c) },
        create: {
          id: oid(c),
          doctorId: ref(c.doctorId)!,
          patientId: ref(c.patientId)!,
          lastChatMessage: c.lastChatMessage,
          lastChatMessageAt: c.lastChatMessageAt ? date(c.lastChatMessageAt) : null,
          lastClinicalMessage: c.lastClinicalMessage,
          lastClinicalMessageAt: c.lastClinicalMessageAt
            ? date(c.lastClinicalMessageAt)
            : null,
          lastMessage: c.lastMessage,
          lastMessageAt: c.lastMessageAt ? date(c.lastMessageAt) : null,
          createdAt: date(c.createdAt),
          updatedAt: date(c.updatedAt),
        },
        update: {},
      });
      bump('chat_conversations', true);
    } catch (e) {
      console.warn('chat_conversation:', oid(c), (e as Error).message);
      bump('chat_conversations', false);
    }
  }

  const messages = await db.collection('chat_messages').find().toArray();
  for (const m of messages) {
    try {
      await prisma.chatMessage.upsert({
        where: { id: oid(m) },
        create: {
          id: oid(m),
          conversationId: ref(m.conversationId)!,
          senderId: ref(m.senderId)!,
          text: m.text,
          kind: m.kind ?? 'chat',
          readAt: m.readAt ? date(m.readAt) : null,
          createdAt: date(m.createdAt),
          updatedAt: date(m.updatedAt),
        },
        update: {},
      });
      bump('chat_messages', true);
    } catch (e) {
      console.warn('chat_message:', oid(m), (e as Error).message);
      bump('chat_messages', false);
    }
  }

  // ── 10. Notificaciones ───────────────────────────────────────────────
  const notifications = await db.collection('notifications').find().toArray();
  for (const n of notifications) {
    try {
      await prisma.notification.upsert({
        where: { id: oid(n) },
        create: {
          id: oid(n),
          userId: ref(n.userId)!,
          title: n.title,
          message: n.message,
          type: n.type ?? 'INFO',
          category: n.category,
          relatedPath: n.relatedPath,
          relatedId: n.relatedId,
          isRead: n.isRead ?? false,
          createdAt: date(n.createdAt),
          updatedAt: date(n.updatedAt),
        },
        update: {},
      });
      bump('notifications', true);
    } catch (e) {
      console.warn('notification:', oid(n), (e as Error).message);
      bump('notifications', false);
    }
  }

  // ── 11. Farmacia: productos y pedidos ────────────────────────────────
  const products = await db.collection('pharmacy_products').find().toArray();
  for (const p of products) {
    try {
      await prisma.pharmacyProduct.upsert({
        where: { id: oid(p) },
        create: {
          id: oid(p),
          pharmacyId: ref(p.pharmacyId)!,
          name: p.name,
          brand: p.brand,
          category: p.category,
          price: p.price ?? 0,
          stock: p.stock ?? 0,
          isAvailable: p.isAvailable ?? true,
          imageUrl: p.imageUrl,
          createdAt: date(p.createdAt),
          updatedAt: date(p.updatedAt),
        },
        update: {},
      });
      bump('pharmacy_products', true);
    } catch (e) {
      console.warn('pharmacy_product:', oid(p), (e as Error).message);
      bump('pharmacy_products', false);
    }
  }

  const orders = await db.collection('pharmacy_orders').find().toArray();
  for (const o of orders) {
    try {
      await prisma.pharmacyOrder.upsert({
        where: { id: oid(o) },
        create: {
          id: oid(o),
          pharmacyId: ref(o.pharmacyId)!,
          patientId: ref(o.patientId),
          productId: ref(o.productId),
          productName: o.productName,
          quantity: o.quantity,
          total: o.total ?? 0,
          status: o.status ?? 'PENDING',
          createdAt: date(o.createdAt),
          updatedAt: date(o.updatedAt),
        },
        update: {},
      });
      bump('pharmacy_orders', true);
    } catch (e) {
      console.warn('pharmacy_order:', oid(o), (e as Error).message);
      bump('pharmacy_orders', false);
    }
  }

  console.log('\n── Resumen de migración ──');
  for (const [table, { ok, skip }] of Object.entries(stats)) {
    console.log(`  ${table}: ${ok} ok${skip ? `, ${skip} omitidos` : ''}`);
  }

  const pgUsers = await prisma.user.count();
  const pgAppts = await prisma.appointment.count();
  console.log(`\nPostgreSQL: ${pgUsers} usuarios, ${pgAppts} citas`);

  await mongoose.disconnect();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
