const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// Runs every 5 minutes
exports.checkReminders = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const oneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const fifteenMin = new Date(now.getTime() + 15 * 60 * 1000);

  // Get all users with FCM tokens
  const tokensSnap = await db.collection('tokens').get();

  for (const tokenDoc of tokensSnap.docs) {
    const token = tokenDoc.id;
    const userId = tokenDoc.data().userId;

    // Get user's tasks
    const tasksSnap = await db.collection('users').doc(userId).collection('tasks')
      .where('completed', '==', false)
      .get();

    for (const taskDoc of tasksSnap.docs) {
      const task = taskDoc.data();
      const deadline = new Date(task.date + 'T' + task.time);
      const diff = deadline - now;

      // Notification 1 hour before
      if (diff > 0 && diff <= 60 * 60 * 1000 && diff > 55 * 60 * 1000) {
        await sendNotification(token, '⏰ Через час дедлайн!', 'Задача: ' + task.title, task.id + '-1h');
      }

      // Notification 15 minutes before
      if (diff > 0 && diff <= 15 * 60 * 1000 && diff > 10 * 60 * 1000) {
        await sendNotification(token, '⏰ Через 15 минут дедлайн!', 'Задача: ' + task.title, task.id + '-15m');
      }

      // Notification at deadline
      if (diff > -5 * 60 * 1000 && diff <= 0) {
        await sendNotification(token, '🔔 Дедлайн!', 'Задача: ' + task.title, task.id + '-now');
      }

      // Repeating notifications every 30 min after overdue
      if (diff < 0) {
        const overdueMin = Math.abs(diff) / (60 * 1000);
        if (overdueMin % 30 < 5) {
          await sendNotification(token, '⚠️ Просроченная задача!', 'Задача: ' + task.title, task.id + '-overdue');
        }
      }
    }
  }

  return null;
});

async function sendNotification(token, title, body, tag) {
  try {
    await messaging.send({
      token: token,
      notification: { title, body },
      data: { tag },
      webpush: {
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          requireInteraction: true
        }
      }
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    // Remove invalid tokens
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      await db.collection('tokens').doc(token).delete();
    }
  }
}
