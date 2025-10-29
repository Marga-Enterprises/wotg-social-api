const cron = require("node-cron");
const Subscription = require("../models/Subscription");
const { sendNotification } = require("../../utils/sendNotification");

// 🕐 Every 10 minutes — remind specific admins to reach out to new users
cron.schedule(
  "*/10 * * * *",
  async () => {
    const startTime = new Date();
    console.log(
      "📣 [Cron] Admin reminder job started at:",
      startTime.toLocaleString("en-PH", { timeZone: "Asia/Manila" })
    );

    try {
      // 🎯 Target specific admin user IDs
      const targetUserIds = [10, 49, 27, 251];

      console.log(`🔍 Fetching subscriptions for admin IDs: ${targetUserIds.join(", ")}`);
      const subscriptions = await Subscription.findAll({
        where: { user_id: targetUserIds },
      });

      if (!subscriptions.length) {
        console.log("ℹ️ No subscriptions found for the selected admin users.");
        return;
      }

      console.log(`📦 Found ${subscriptions.length} active admin subscriptions.`);

      // ✨ Reminder messages for admins
      const reminderMessages = [
        "Hey Admin! 👋 Don’t forget to check in with our new users today.",
        "Friendly reminder: Reach out and chat with new users to make them feel welcome!",
        "Time to connect with our newest members — a simple chat can make a big impact!",
        "Reminder: Build relationships with new users. Send them a quick message today!",
        "Let’s stay connected — message our new users and encourage them to keep growing in faith!",
      ];

      const message =
        reminderMessages[Math.floor(Math.random() * reminderMessages.length)];

      console.log(`💬 Selected reminder message: "${message}"`);

      // 🔁 Loop through each admin subscription
      for (const [index, subscription] of subscriptions.entries()) {
        console.log(
          `➡️ [${index + 1}/${subscriptions.length}] Processing admin user ID: ${subscription.user_id}`
        );

        try {
          let subscriptionData = subscription.subscription;

          // ✅ Parse JSON if stored as string
          if (typeof subscriptionData === "string") {
            try {
              subscriptionData = JSON.parse(subscriptionData);
            } catch (error) {
              console.error("⚠️ Failed to parse subscription JSON:", error.message);
              continue;
            }
          }

          // ✅ Detect FCM token
          const fcmToken =
            subscription.fcmToken ||
            subscription.fcm_token ||
            subscriptionData?.fcmToken ||
            subscriptionData?.token ||
            subscriptionData?.endpoint ||
            null;

          if (!fcmToken) {
            console.warn("⚠️ No FCM token found for this admin:", {
              id: subscription.id,
              user_id: subscription.user_id,
              keys: Object.keys(subscription.toJSON()),
            });
            continue;
          }

          // ✅ Prepare notification payload
          const data = {
            type: "admin_reminder",
            url: "https://management.wotgonline.com/users",
          };

          console.log(
            `📤 Sending admin reminder to user ${subscription.user_id} (token: ${fcmToken.slice(
              0,
              25
            )}...)`
          );

          await sendNotification(
            fcmToken,
            "WOTG Admin Reminder",
            message,
            data
          );

          console.log(`✅ Reminder sent successfully to admin ${subscription.user_id}`);
        } catch (error) {
          console.error("❌ Error sending notification for one admin:", error.message);
        }
      }

      console.log(
        "✅ [Cron] Admin reminders completed successfully at",
        new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" })
      );
    } catch (error) {
      console.error("❌ [Cron] Fatal error in Admin Reminder Job:", error);
    }

    console.log("🕒 [Cron] Waiting for next 10-minute interval...\n");
  },
  { timezone: "Asia/Manila" }
);
