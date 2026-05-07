const axios = require('axios');

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'https://discordapp.com/api/webhooks/1500951215226355872/QYoU0Xk0f4CvDATn1SAYl2qxaZK7wVx39SaDTwOuFqgywcfj5cszM00FTO76pNuQcfxP';

async function sendNewSubmissionNotification(ticker, submitterName) {
    try {
        await axios.post(WEBHOOK_URL, {
            embeds: [{
                title: '📊 New Watchlist Submission',
                description: `**${submitterName}** has submitted **${ticker}** for review`,
                color: 0x1A3A2E, // Forest green
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'Old Logan Capital Watchlist System'
                }
            }]
        });
    } catch (error) {
        console.error('Discord notification error:', error.message);
    }
}

async function sendReviewCompleteNotification(ticker, reviewerName, reviewsCompleted, totalReviews) {
    try {
        await axios.post(WEBHOOK_URL, {
            embeds: [{
                title: '✅ Review Completed',
                description: `**${reviewerName}** has completed their review of **${ticker}**\n\nProgress: ${reviewsCompleted}/${totalReviews} reviews complete`,
                color: 0x2D5A4A, // Forest light
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'Old Logan Capital Watchlist System'
                }
            }]
        });
    } catch (error) {
        console.error('Discord notification error:', error.message);
    }
}

async function sendAllReviewsCompleteNotification(ticker, avgConfidence) {
    try {
        const confidenceStars = '⭐'.repeat(Math.round(avgConfidence));

        await axios.post(WEBHOOK_URL, {
            embeds: [{
                title: '🎯 Ready for Review',
                description: `All reviews for **${ticker}** are complete!\n\n**Average Confidence:** ${avgConfidence.toFixed(2)}/5 ${confidenceStars}\n\nResults are now visible to the team.`,
                color: 0xC9A962, // Gold
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'Old Logan Capital Watchlist System'
                }
            }]
        });
    } catch (error) {
        console.error('Discord notification error:', error.message);
    }
}

module.exports = {
    sendNewSubmissionNotification,
    sendReviewCompleteNotification,
    sendAllReviewsCompleteNotification
};
