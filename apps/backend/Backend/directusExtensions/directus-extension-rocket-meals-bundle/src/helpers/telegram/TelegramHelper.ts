import { makeTgBotClient } from '@effect-ak/tg-bot-client';

export type TelegramSendMessagePayload = {
  chat_ids: string[] | number[];
  text: string;
  parse_mode?: string;
  disable_notification?: boolean;
  message_thread_id?: number;
};

export class TelegramHelper {

  static async sendSafeMessage(botToken: string, payload: TelegramSendMessagePayload) {
    // get recent chat message of the chat ids
    let chatIdsSet = new Set<number>();
    for(const chat_id of payload.chat_ids) {
      chatIdsSet.add(typeof chat_id === 'string' ? parseInt(chat_id) : chat_id);
    }

    let chatsWhichWantMessage: number[] = [];
    for(const chat_id of chatIdsSet) {
      const recentMessages = await TelegramHelper.getRecentChatMessagesFromChatIds(botToken, new Set([chat_id]), 1);
      const messages = recentMessages.get(chat_id);
      // check if last message is from the user
      if(messages && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if(lastMessage.from && !lastMessage.from.is_bot) {
          // check if message does not contain "/stop"
          if(!lastMessage.text || !lastMessage.text.includes('/stop')) {
            chatsWhichWantMessage.push(chat_id);
          }
        }
      }
    }

    if(chatsWhichWantMessage.length > 0) {
      let messageText = payload.text + "\n\nTo stop receiving these messages, reply with /stop.";
      await TelegramHelper.sendMessage(botToken, {
        ...payload,
        chat_ids: chatsWhichWantMessage,
        text: messageText,
      });
    }
  }

  static async sendMessage(botToken: string, payload: TelegramSendMessagePayload) {
    const client = makeTgBotClient({ bot_token: botToken });
    for(const chat_id of payload.chat_ids) {
      await client.execute('send_message', {
        chat_id: chat_id,
        text: payload.text,
        disable_notification: payload.disable_notification,
        message_thread_id: payload.message_thread_id,
      });
    }
  }

  static async getRecentChatMessagesFromChatIds(botToken: string, chatIds: Set<number>, limitPerChat: number = 5): Promise<Map<number, any[]>> {
    const client = makeTgBotClient({ bot_token: botToken });
    const chatMessagesMap = new Map<number, any[]>();
    for (const chatId of chatIds) {
      const updates = await client.execute('get_updates', { limit: limitPerChat });
      const messages = updates
        .filter((update) => update.message && update.message.chat && update.message.chat.id === chatId)
        .map((update) => update.message);
      chatMessagesMap.set(chatId, messages);
    }
    return chatMessagesMap;
  }

  static async getRecentChatIds(botToken: string, limit: number = 10): Promise<Set<number>> {
    const client = makeTgBotClient({ bot_token: botToken });
    const updates = await client.execute('get_updates', { limit });
    const chatIds = new Set<number>();
    updates.forEach((update) => {
      if (update.message && update.message.chat && update.message.chat.id) {
        chatIds.add(update.message.chat.id);
      }
    });
    return chatIds;
  }
}
