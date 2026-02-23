import { describe, expect, it } from '@jest/globals';
import { makeTgBotClient } from '@effect-ak/tg-bot-client';
import { TelegramHelper } from '../TelegramHelper';

// Single test running all Directus test scenarios sequentially

describe('Directus server sequential tests', () => {
  it('sets up server and performs user operations', async () => {

    let botToken = "8528829647:AAFNY-wiMKBXaReKdyQq4foRhiYNRuTyw_Q";
    const client = makeTgBotClient({ bot_token: botToken });

    // find all chat ids from recent messages
    const chatIds = await TelegramHelper.getRecentChatIds(botToken, 10);

    console.log("Found chat IDs:", chatIds);

    await TelegramHelper.sendSafeMessage(botToken, {
      chat_ids: Array.from(chatIds),
      text: "Test message from TelegramHelperTest",
    });

  }, 60000);
});
