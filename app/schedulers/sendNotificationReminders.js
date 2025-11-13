const cron = require("node-cron");
const Subscription = require("../models/Subscription");
const { sendNotification } = require("../../utils/sendNotification");

// Runs every hour
cron.schedule(
  "0 * * * *",
  async () => {
    try {
      const subscriptions = await Subscription.findAll();
      if (!subscriptions.length) return;

      const reminderMessages = [
        "Take a moment to read God's Word today",
        "A verse a day keeps the heart strong",
        "God’s Word is your daily bread",
        "Pause and meditate on Scripture",
        "Let the Word guide your steps today",
      ];

      const message =
        reminderMessages[Math.floor(Math.random() * reminderMessages.length)];

      for (const subscription of subscriptions) {
        try {
          let subscriptionData = subscription.subscription;

          // Parse JSON if stored as string
          if (typeof subscriptionData === "string") {
            try {
              subscriptionData = JSON.parse(subscriptionData);
            } catch {
              continue;
            }
          }

          const fcmToken =
            subscription.fcmToken ||
            subscription.fcm_token ||
            subscriptionData?.fcmToken ||
            subscriptionData?.token ||
            subscriptionData?.endpoint ||
            null;

          if (!fcmToken) continue;

          const data = {
            type: "bible_reminder",
            url: "https://community.wotgonline.com/bible",
          };

          await sendNotification(
            fcmToken,
            "Daily Bible Reminder",
            message,
            data
          );
        } catch {
          continue;
        }
      }
    } catch {
      // Fail silently in production
    }
  },
  { timezone: "Asia/Manila" }
);
