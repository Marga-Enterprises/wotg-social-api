const Subscription = require('../models/Subscription'); // Import Message model

// Subscribe User to Push Notifications
exports.subscribe = async (req, res) => {
    const { userId, subscription } = req.body;

    try {
        // Check if the user is already subscribed (optional, to prevent duplicate subscriptions)
        const existingSubscription = await Subscription.findOne({
            where: { userId: userId },
        });

        if (existingSubscription) {
            return res.status(400).json({ message: 'User is already subscribed.' });
        }

        // Save the subscription details in the database
        const newSubscription = await Subscription.create({
            userId,
            subscription: JSON.stringify(subscription), // Store subscription as JSON string
        });

        return res.status(200).json({ message: 'User subscribed successfully!' });
    } catch (error) {
        console.error('Error saving subscription:', error);
        return res.status(500).json({ message: 'Failed to subscribe user.' });
    }
};

// Unsubscribe User from Push Notifications
exports.unsubscribe = async (req, res) => {
    const { subscriptionId } = req.params;  // Fetching the subscriptionId from the URL parameter

    try {
        // Attempt to find and delete the subscription from the database using the provided subscriptionId
        const deletedSubscription = await Subscription.destroy({
            where: { id: subscriptionId }
        });

        if (deletedSubscription) {
            return sendSuccess(res, 'Unsubscribed successfully.');
        } else {
            return sendError(res, null, 'Subscription not found.');
        }
    } catch (error) {
        console.error('Error unsubscribing:', error);
        return sendError(res, error, 'Failed to unsubscribe.');
    }
};

