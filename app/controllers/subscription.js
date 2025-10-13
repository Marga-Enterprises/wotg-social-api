const Subscription = require('../models/Subscription'); 
const admin = require('../../firebase'); // ✅ import your Admin SDK initializer

// ✅ Subscribe User to Push Notifications
exports.subscribe = async (req, res) => {
  const { userId, deviceId, deviceType, subscription } = req.body;

  try {
    const fcmToken = subscription?.fcmToken;
    if (!fcmToken) {
      return res.status(400).json({ message: "Missing FCM token." });
    }

    // 🔎 Check if the device is already subscribed
    const existingSubscription = await Subscription.findOne({
      where: { userId, deviceId },
    });

    if (existingSubscription) {
      await existingSubscription.update({ subscription });

      // ✅ Ensure token is subscribed to topic even if updated
      await admin.messaging().subscribeToTopic(fcmToken, "main-site");
      console.log(`🔔 Updated + subscribed user ${userId} to 'main-site'`);

      return res.status(200).json({ message: "Subscription updated successfully!" });
    }

    // 🆕 Create new subscription
    const newSubscription = await Subscription.create({
      userId,
      deviceId,
      deviceType,
      subscription,
    });

    // ✅ Subscribe token to topic
    await admin.messaging().subscribeToTopic(fcmToken, "main-site");
    console.log(`✅ Subscribed new user ${userId} to 'main-site'`);

    return res.status(200).json({
      message: "Device subscribed successfully and added to 'main-site' topic!",
      data: newSubscription,
    });
  } catch (error) {
    console.error("❌ Error saving subscription:", error);
    return res.status(500).json({ message: "Failed to subscribe device." });
  }
};

// ✅ Unsubscribe User from Push Notifications
exports.unsubscribe = async (req, res) => {
  const { subscriptionId } = req.params;

  try {
    const subscription = await Subscription.findOne({ where: { id: subscriptionId } });
    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found." });
    }

    // ✅ Optional: also remove from topic before deleting
    const fcmToken = subscription.subscription?.fcmToken;
    if (fcmToken) {
      await admin.messaging().unsubscribeFromTopic(fcmToken, "main-site");
      console.log(`🚫 Unsubscribed token from 'main-site' topic`);
    }

    await Subscription.destroy({ where: { id: subscriptionId } });
    return res.status(200).json({ message: "Unsubscribed successfully." });
  } catch (error) {
    console.error("❌ Error unsubscribing:", error);
    return res.status(500).json({ message: "Failed to unsubscribe." });
  }
};
