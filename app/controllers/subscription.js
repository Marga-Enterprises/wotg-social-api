const Subscription = require('../models/Subscription'); // Import Subscription model

// ✅ Subscribe User to Push Notifications
exports.subscribe = async (req, res) => {
    const { userId, deviceId, deviceType, subscription } = req.body;

    try {
        // Check if the device is already subscribed
        const existingSubscription = await Subscription.findOne({
            where: { userId, deviceId },
        });

        if (existingSubscription) {
            // Update existing subscription with new FCM token
            await existingSubscription.update({ subscription });
            return res.status(200).json({ message: "Subscription updated successfully!" });
        }

        // Create a new subscription for the device
        const newSubscription = await Subscription.create({
            userId,
            deviceId,
            deviceType,
            subscription, // Store FCM token inside JSON object
        });

        return res.status(200).json({
            message: "Device subscribed successfully!",
            data: newSubscription,
        });
    } catch (error) {
        console.error("Error saving subscription:", error);
        return res.status(500).json({ message: "Failed to subscribe device." });
    }
};


// ✅ Unsubscribe User from Push Notifications
exports.unsubscribe = async (req, res) => {
    const { subscriptionId } = req.params; // Fetching the subscriptionId from the URL parameter

    try {
        // Attempt to find and delete the subscription from the database using the provided subscriptionId
        const deletedSubscription = await Subscription.destroy({
            where: { id: subscriptionId }
        });

        if (deletedSubscription) {
            return res.status(200).json({ message: 'Unsubscribed successfully.' });
        } else {
            return res.status(404).json({ message: 'Subscription not found.' });
        }
    } catch (error) {
        console.error('Error unsubscribing:', error);
        return res.status(500).json({ message: 'Failed to unsubscribe.' });
    }
};
