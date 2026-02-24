// Firebase Cloud Messaging - stubbed out for now
// TODO: Configure FCM credentials and implement actual push delivery

export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushNotification(deviceToken: string, notification: PushNotification): Promise<void> {
  console.log(`[PUSH STUB] Would send to ${deviceToken}:`, notification);
  // TODO: Implement with firebase-admin SDK
  // import { getMessaging } from 'firebase-admin/messaging';
  // await getMessaging().send({ token: deviceToken, notification, data: notification.data });
}

export async function notifyDeviceOfRequest(deviceToken: string, requestId: string, message: string): Promise<void> {
  await sendPushNotification(deviceToken, {
    title: 'New Scan Request',
    body: message,
    data: { request_id: requestId, type: 'scan_request' },
  });
}
