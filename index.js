const fs = require('fs');

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

async function saveMessage(message, channelName) {
  if (message.files) {
    for (const file of message.files) {
      const fileData = await app.client.files.info({file: file.id});
      file.data      = fileData.file;
    }
  }
  if (message.subtype === 'file_share') {
    const fileData = await app.client.files.info({file: message.file.id});
    message.data   = fileData.file;
  }
  if (message.subtype === 'bot_message') {
    const botData = await app.client.bots.info({bot: message.bot_id});
    message.data  = botData.bot;
  }
  // save the message into a local folder ./messsages/channel_name/thread_ts.json
  if (!channelName) {
    const channel = await app.client.conversations.info({channel: message.channel});
    channelName   = channel.channel.name;
  }
  const thread = message.thread_ts ? message.thread_ts : message.ts;
  const path   = `./messages/${channelName}/${thread}.json`;
  fs.mkdirSync(`./messages/${channelName}`, {recursive: true});
  const threadContent = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : [];
  threadContent.push(message);
  fs.writeFileSync(path, JSON.stringify(threadContent, null, 2));
}

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
      // {      // save all messages in the channel
      //   const {messages} = await app.client.conversations.history({channel: channel.id});
      //   for (const message of messages) {
      //     await saveMessage(message, channel.name);
      //   }
      // }
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
    await saveMessage(message);
  });
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();
