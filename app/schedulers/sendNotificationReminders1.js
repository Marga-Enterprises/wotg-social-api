const cron = require("node-cron");
const sequelize = require("../../config/db");
const Subscription = require("../models/Subscription");
const { sendNotification } = require("../../utils/sendNotification");

// ⏰ Every 30 minutes (minute 0 and 30)
cron.schedule(
  "*/30 * * * *",
  async () => {
    const startTime = new Date();
    console.log(
      "[Cron] Music reminder broadcast started at:",
      startTime.toLocaleString("en-PH", { timeZone: "Asia/Manila" })
    );

    try {
      console.log("Fetching all subscriptions...");
      const subscriptions = await Subscription.findAll();
      if (!subscriptions.length) {
        console.log("No subscriptions found in database.");
        return;
      }
      console.log(`Found ${subscriptions.length} subscriptions.`);

      // No emojis, short and clear lines
      const reminderMessages = [
        "Take a moment to listen to worship music today",
        "Let godly music renew your mind",
        "Fill your day with songs that honor God",
        "Set your heart on God with worship music",
        "Strengthen your faith with songs of praise",
      ];
      const message =
        reminderMessages[Math.floor(Math.random() * reminderMessages.length)];
      console.log(`Selected reminder message: "${message}"`);

      for (const [index, subscription] of subscriptions.entries()) {
        console.log(`[${index + 1}/${subscriptions.length}] Processing subscription ID: ${subscription.id}`);

        try {
          let subscriptionData = subscription.subscription;

          if (typeof subscriptionData === "string") {
            try {
              subscriptionData = JSON.parse(subscriptionData);
              console.log("Parsed subscription JSON successfully.");
            } catch (error) {
              console.error("Failed to parse subscription JSON:", error.message);
              continue;
            }
          }

          // Try common token fields
          const fcmToken =
            subscription.fcmToken ||
            subscription.fcm_token ||
            subscriptionData?.fcmToken ||
            subscriptionData?.token ||
            subscriptionData?.endpoint ||
            null;

          if (!fcmToken) {
            console.warn("No FCM token found for this subscription:", {
              id: subscription.id,
              user_id: subscription.user_id,
              keys: Object.keys(subscription.toJSON()),
            });
            continue;
          }

          const data = {
            type: "music_reminder",
            url: "https://community.wotgonline.com/music",
          };

          console.log(
            `Sending notification to user ${subscription.user_id || "(unknown user)"} with token: ${fcmToken.slice(0, 25)}...`
          );

          // Order: (fcmToken, title, body, data)
          await sendNotification(
            fcmToken,
            "Worship Music Reminder",
            message,
            data
          );

          console.log(
            `Notification sent successfully to user ${subscription.user_id || "(unknown user)"}`
          );
        } catch (error) {
          console.error("Error sending notification for one user:", error.message);
        }
      }

      console.log(
        "Music reminders completed successfully at",
        new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" })
      );
    } catch (error) {
      console.error("Fatal error in music reminder job:", error);
    }

    console.log("Job finished. Waiting for next interval...\n");
  },
  { timezone: "Asia/Manila" }
);
