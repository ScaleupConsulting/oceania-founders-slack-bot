const dotenv = require('dotenv');
dotenv.config();
dotenv.config({path: `.env.local`, override: true});

const TIMEOUT_SECONDS = 60 * 60 * 24;

const {App}    = require('@slack/bolt');
const app      = new App(
  {
    token:         process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode:    true,
    appToken:      process.env.SLACK_APP_TOKEN,
  }
);
const notifyMe = async () => {
  const text = `No message was sent in the last 24 hours.
  Visit https://oceaniafounders.slack.com/admin to see the last 5 users to join the workspace`;
  await app.client.chat.postMessage({channel: 'U04MTT9UBC6', text});
};

(async () => {
  let lastMessageInAnyChannel = null;
  let notificationTimeout     = null;

  // check on startup if there is a public message in the last 24 hours
  const {channels} = await app.client.conversations.list({types: 'public_channel'});
  for (const channel of channels) {
    if (!channel.is_archived) {
      if (!channel.is_member) {
        await app.client.conversations.join({channel: channel.id});
      }
      // get the last message sent in the channel which is not a joining message
      const {messages} = await app.client.conversations.history(
        {channel: channel.id, oldest: (Date.now() / 1000 - 60 * 60 * 24).toString()}
      );
      for (const message of messages) {
        if (message.subtype !== 'channel_join') {
          if (!lastMessageInAnyChannel || message.ts > lastMessageInAnyChannel.ts) {
            lastMessageInAnyChannel = {channel, ...message};
          }
        }
      }
    }
  }
  if (lastMessageInAnyChannel && lastMessageInAnyChannel.ts > Date.now() / 1000 - TIMEOUT_SECONDS) {
    console.log(`Last message was sent in ${lastMessageInAnyChannel.channel.name} at ` +
                new Date(lastMessageInAnyChannel.ts * 1000));
    notificationTimeout =
      setTimeout(notifyMe, TIMEOUT_SECONDS * 1000 - (Date.now() - lastMessageInAnyChannel.ts * 1000));
  } else {
    await notifyMe();
  }
  // listen for messages in all channels
  app.message(async ({message, say}) => {
    if (message.subtype !== 'channel_join') {
      lastMessageInAnyChannel = message;
      clearTimeout(notificationTimeout);
      notificationTimeout = setTimeout(notifyMe, TIMEOUT_SECONDS * 1000);
    }
  });
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();
