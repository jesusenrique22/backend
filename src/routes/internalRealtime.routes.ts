import { Router } from 'express';
import { requireInternalRealtimeAuth } from '../middleware/internalAuth';
import {
  postCallAccept,
  postCallEnd,
  postCallInvite,
  postCallPeer,
  postCallReject,
  postClinicAdminRooms,
  postConversationJoin,
  postDriverRooms,
  postEmergencyCallAccept,
  postEmergencyCallEnd,
  postEmergencyCallInvite,
  postEmergencyCallPeer,
  postEmergencyCallReject,
  postEmergencyJoin,
  postEmergencyMessageSend,
  postMessageSend,
} from '../controllers/internalRealtime.controller';

const router = Router();

router.use(requireInternalRealtimeAuth);

router.post('/conversation/join', postConversationJoin);
router.post('/message/send', postMessageSend);
router.post('/call/invite', postCallInvite);
router.post('/call/accept', postCallAccept);
router.post('/call/reject', postCallReject);
router.post('/call/end', postCallEnd);
router.post('/call/peer', postCallPeer);
router.post('/clinic-admin/rooms', postClinicAdminRooms);
router.post('/driver/rooms', postDriverRooms);
router.post('/emergency/join', postEmergencyJoin);
router.post('/emergency/message/send', postEmergencyMessageSend);
router.post('/emergency/call/invite', postEmergencyCallInvite);
router.post('/emergency/call/accept', postEmergencyCallAccept);
router.post('/emergency/call/reject', postEmergencyCallReject);
router.post('/emergency/call/end', postEmergencyCallEnd);
router.post('/emergency/call/peer', postEmergencyCallPeer);

export default router;
