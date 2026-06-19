import './loadEnv';

import express from 'express';
import path from 'path';

import { connectDatabase } from './config/db';
import { createCorsMiddleware } from './config/cors';
import internalRealtimeRoutes from './routes/internalRealtime.routes';
import authRoutes from './routes/auth.routes';
import patientRoutes from './routes/patient.routes';
import doctorRoutes from './routes/doctor.routes';
import appointmentRoutes from './routes/appointment.routes';
import chatRoutes from './routes/chat.routes';
import catalogRoutes from './routes/catalog.routes';
import adminRoutes from './routes/admin.routes';
import superAdminRoutes from './routes/superAdmin.routes';
import clinicAdminRoutes from './routes/clinicAdmin.routes';
import pharmacyAdminRoutes from './routes/pharmacyAdmin.routes';
import pharmacyStaffRoutes from './routes/pharmacyStaff.routes';
import notificationRoutes from './routes/notification.routes';
import emergencyRoutes from './routes/emergency.routes';
import ambulanceCrewRoutes from './routes/ambulanceCrew.routes';
import equipmentRoutes from './routes/equipment.routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(createCorsMiddleware());
app.use(express.json({ limit: '16mb' }));
app.use(
  '/uploads/medical-documents',
  express.static(path.join(process.cwd(), 'uploads', 'medical-documents')),
);
app.use(
  '/uploads/chat-images',
  express.static(path.join(process.cwd(), 'uploads', 'chat-images')),
);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'OK', message: 'Smart Medic API running' });
});

app.get('/', (_req, res) => {
  res.status(200).json({
    service: 'smart-medic-api',
    status: 'OK',
    message: 'API REST activa. Los endpoints están bajo /api/…',
    health: '/health',
    note: 'El WebSocket (chat/llamadas) está en el puerto 3001 (realtime-gateway), no aquí.',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/clinic-admin', clinicAdminRoutes);
app.use('/api/pharmacy-admin', pharmacyAdminRoutes);
app.use('/api/pharmacy-staff', pharmacyStaffRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/emergencies', emergencyRoutes);
app.use('/api/ambulance-crew', ambulanceCrewRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/internal/realtime', internalRealtimeRoutes);

async function start() {
  try {
    await connectDatabase();
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`Smart Medic API en puerto ${PORT} (0.0.0.0, REST)`);
      console.log(
        `Gateway WebSocket esperado en ${process.env.REALTIME_GATEWAY_URL || 'http://localhost:3001'}`,
      );
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error);
    process.exit(1);
  }
}

start();
