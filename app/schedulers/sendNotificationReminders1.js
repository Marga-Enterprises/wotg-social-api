const cron = require("node-cron");
const Subscription = require("../models/Subscription");
const { sendNotification } = require("../../utils/sendNotification");

// Runs every hour at minute 0 (you wrote this schedule)
cron.schedule(
  "0 * * * *",
  async () => {
    try {
      const subscriptions = await Subscription.findAll();
      if (!subscriptions.length) return;

      const reminderMessages = [
        "Take a moment to listen to worship music today",
        "Let godly music renew your mind",
        "Fill your day with songs that honor God",
        "Set your heart on God with worship music",
        "Strengthen your faith with songs of praise",
      ];

      const message =
        reminderMessages[Math.floor(Math.random() * reminderMessages.length)];

      for (const subscription of subscriptions) {
        try {
          let subscriptionData = subscription.subscription;

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
            type: "music_reminder",
            url: "https://community.wotgonline.com/music",
          };

          await sendNotification(
            fcmToken,
            "Worship Music Reminder",
            message,
            data
          );
        } catch {
          continue;
        }
      }
    } catch {
      // Silent fail in production
    }
  },
  { timezone: "Asia/Manila" }
);
