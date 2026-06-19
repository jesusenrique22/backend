import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  changeAmbulanceCrewPassword,
  getAmbulanceCrewProfile,
  updateAmbulanceCrewProfile,
} from '../services/ambulanceCrewProfile.service';

export const getMyAmbulanceCrewProfile = async (req: AuthRequest, res: Response) => {
  try {
    const profile = await getAmbulanceCrewProfile(req.user!.id);
    res.json(profile);
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
};

export const patchMyAmbulanceCrewProfile = async (req: AuthRequest, res: Response) => {
  const { name, phone, profilePic, licenseNumber, certification, bio } = req.body as {
    name?: string;
    phone?: string;
    profilePic?: string;
    licenseNumber?: string | null;
    certification?: string | null;
    bio?: string | null;
  };

  try {
    const profile = await updateAmbulanceCrewProfile(req.user!.id, {
      name,
      phone,
      profilePic,
      licenseNumber,
      certification,
      bio,
    });
    res.json(profile);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const changeMyAmbulanceCrewPassword = async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Contraseña actual y nueva son obligatorias' });
  }

  try {
    const result = await changeAmbulanceCrewPassword(
      req.user!.id,
      currentPassword,
      newPassword,
    );
    res.json(result);
  } catch (e) {
    const message = (e as Error).message;
    res.status(message.includes('actual') ? 400 : 404).json({ error: message });
  }
};
