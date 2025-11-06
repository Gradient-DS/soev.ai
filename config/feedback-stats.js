const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { silentExit } = require('./helpers');
const { Message } = require('@librechat/data-schemas').createModels(mongoose);
const connect = require('./connect');

(async () => {
  await connect();

  console.purple('-----------------------------');
  console.purple('LibreChat Feedback Analysis');
  console.purple('-----------------------------\n');

  // 1. Get all messages with feedback
  const messagesWithFeedback = await Message.find({
    'feedback': { $exists: true, $ne: null }
  }).select('messageId conversationId user text feedback endpoint model createdAt').lean();

  console.log(`Total messages with feedback: ${messagesWithFeedback.length}\n`);

  if (messagesWithFeedback.length === 0) {
    console.yellow('No feedback found in the database yet.');
    silentExit(0);
    return;
  }

  // 2. Aggregate feedback by rating
  const ratingStats = await Message.aggregate([
    { $match: { 'feedback.rating': { $exists: true } } },
    { $group: { 
      _id: '$feedback.rating', 
      count: { $sum: 1 } 
    }}
  ]);

  console.cyan('Feedback by Rating:');
  ratingStats.forEach(stat => {
    const emoji = stat._id === 'thumbsUp' ? '👍' : '👎';
    console.log(`  ${emoji} ${stat._id}: ${stat.count}`);
  });

  // 3. Aggregate feedback by tag
  const tagStats = await Message.aggregate([
    { $match: { 'feedback.tag': { $exists: true, $ne: null } } },
    { $group: { 
      _id: '$feedback.tag', 
      count: { $sum: 1 } 
    }},
    { $sort: { count: -1 } }
  ]);

  console.cyan('\nFeedback by Tag:');
  tagStats.forEach(stat => {
    console.log(`  ${stat._id}: ${stat.count}`);
  });

  // 4. Get feedback with text comments
  const feedbackWithText = await Message.find({
    'feedback.text': { $exists: true, $ne: null, $ne: '' }
  }).select('messageId feedback.text feedback.rating feedback.tag createdAt').lean();

  console.cyan(`\nFeedback with text comments: ${feedbackWithText.length}`);
  if (feedbackWithText.length > 0) {
    console.cyan('\nRecent text feedback (last 5):');
    feedbackWithText.slice(-5).forEach((msg, i) => {
      const emoji = msg.feedback.rating === 'thumbsUp' ? '👍' : '👎';
      console.log(`\n${i + 1}. ${emoji} [${msg.feedback.rating}] ${msg.feedback.tag || 'no tag'}`);
      console.log(`   "${msg.feedback.text}"`);
      console.log(`   Date: ${new Date(msg.createdAt).toLocaleString()}`);
    });
  }

  // 5. Feedback by endpoint
  const endpointStats = await Message.aggregate([
    { $match: { 'feedback.rating': { $exists: true } } },
    { $group: { 
      _id: '$endpoint', 
      count: { $sum: 1 },
      thumbsUp: {
        $sum: { $cond: [{ $eq: ['$feedback.rating', 'thumbsUp'] }, 1, 0] }
      },
      thumbsDown: {
        $sum: { $cond: [{ $eq: ['$feedback.rating', 'thumbsDown'] }, 1, 0] }
      }
    }},
    { $sort: { count: -1 } }
  ]);

  console.cyan('\nFeedback by Endpoint:');
  endpointStats.forEach(stat => {
    console.log(`  ${stat._id || 'unknown'}: ${stat.count} total (👍 ${stat.thumbsUp}, 👎 ${stat.thumbsDown})`);
  });

  // 6. Export raw data to JSON (optional)
  const exportPath = path.resolve(__dirname, '..', 'feedback-export.json');
  fs.writeFileSync(
    exportPath, 
    JSON.stringify(messagesWithFeedback, null, 2)
  );
  console.green(`\n✓ Raw feedback data exported to: feedback-export.json`);

  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (!err.message.includes('fetch failed')) {
    process.exit(1);
  }
});