const cron = require("node-cron");
const Subscription = require("../models/Subscription");
const { sendNotification } = require("../../utils/sendNotification");

// 🕐 Every 15 minute — send random Bible reminder notification (test mode)
cron.schedule(
  "/15 * * * *",
  async () => {
    const startTime = new Date();
    console.log(
      "📖 [Cron] Bible reminder broadcast started at:",
      startTime.toLocaleString("en-PH", { timeZone: "Asia/Manila" })
    );

    try {
      console.log("🔍 Fetching all subscriptions...");
      const subscriptions = await Subscription.findAll();

      if (!subscriptions.length) {
        console.log("ℹ️ No subscriptions found in database.");
        return;
      }

      console.log(`📦 Found ${subscriptions.length} subscriptions.`);

      // 🧠 Step 1: Prepare random Bible reminder messages
      const reminderMessages = [
        "Take a moment to read God's Word today",
        "A verse a day keeps the heart strong",
        "God’s Word is your daily bread",
        "Pause and meditate on Scripture",
        "Let the Word guide your steps today",
      ];

      const message =
        reminderMessages[Math.floor(Math.random() * reminderMessages.length)];

      console.log(`💬 Selected reminder message: "${message}"`);

      // 🧠 Step 2: Loop through all subscriptions
      for (const [index, subscription] of subscriptions.entries()) {
        console.log(
          `➡️ [${index + 1}/${subscriptions.length}] Processing subscription ID: ${subscription.id}`
        );

        try {
          let subscriptionData = subscription.subscription;

          // ✅ Parse JSON if stored as a string
          if (typeof subscriptionData === "string") {
            try {
              subscriptionData = JSON.parse(subscriptionData);
              console.log("✅ Parsed subscription JSON successfully.");
            } catch (error) {
              console.error("⚠️ Failed to parse subscription JSON:", error.message);
              continue;
            }
          }

          // ✅ Detect FCM token (handles multiple formats)
          const fcmToken =
            subscription.fcmToken ||
            subscription.fcm_token ||
            subscriptionData?.fcmToken ||
            subscriptionData?.token ||
            subscriptionData?.endpoint ||
            null;

          if (!fcmToken) {
            console.warn("⚠️ No FCM token found for this subscription:", {
              id: subscription.id,
              user_id: subscription.user_id,
              keys: Object.keys(subscription.toJSON()),
            });
            continue;
          }

          // ✅ Prepare notification payload
          const data = {
            type: "bible_reminder",
            url: "https://community.wotgonline.com/bible",
          };

          console.log(
            `📤 Sending notification to user ${
              subscription.user_id || "(unknown user)"
            } with token: ${fcmToken.slice(0, 25)}...`
          );

          // ✅ Correct parameter order (fcmToken, title, body, data)
          await sendNotification(
            fcmToken,
            "Daily Bible Reminder",
            message,
            data
          );

          console.log(
            `✅ Notification sent successfully to user ${
              subscription.user_id || "(unknown user)"
            }`
          );
        } catch (error) {
          console.error("❌ Error sending notification for one user:", error.message);
        }
      }

      console.log(
        "✅ [Cron] Bible reminders completed successfully at",
        new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" })
      );
    } catch (error) {
      console.error("❌ [Cron] Fatal error in Bible reminder job:", error);
    }

    console.log("🕒 [Cron] Job finished. Waiting for next interval...\n");
  },
  { timezone: "Asia/Manila" }
);
