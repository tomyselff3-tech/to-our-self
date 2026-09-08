import axios, { AxiosInstance } from 'axios';

export interface TelegramBotApiResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

export class TelegramBotClient {
  private client: AxiosInstance;
  private botToken: string;

  constructor(botToken: string, baseUrl: string = 'https://api.telegram.org') {
    this.botToken = botToken;
    this.client = axios.create({
      baseURL: `${baseUrl}/bot${botToken}`,
      timeout: 10000,
    });
  }

  async getMe(): Promise<any> {
    const response = await this.client.get<TelegramBotApiResponse<any>>('/getMe');
    if (!response.data.ok) {
      throw new Error(`Telegram API Error: ${response.data.description}`);
    }
    return response.data.result;
  }

  async sendMessage(
    chatId: number,
    text: string,
    options: Record<string, any> = {}
  ): Promise<any> {
    const response = await this.client.post<TelegramBotApiResponse<any>>('/sendMessage', {
      chat_id: chatId,
      text,
      ...options,
    });
    if (!response.data.ok) {
      throw new Error(`Telegram API Error: ${response.data.description}`);
    }
    return response.data.result;
  }

  async editMessage(
    chatId: number,
    messageId: number,
    text: string,
    options: Record<string, any> = {}
  ): Promise<any> {
    const response = await this.client.post<TelegramBotApiResponse<any>>('/editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...options,
    });
    if (!response.data.ok) {
      throw new Error(`Telegram API Error: ${response.data.description}`);
    }
    return response.data.result;
  }

  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    const response = await this.client.post<TelegramBotApiResponse<any>>('/deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
    if (!response.data.ok) {
      throw new Error(`Telegram API Error: ${response.data.description}`);
    }
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    options: Record<string, any> = {}
  ): Promise<void> {
    const response = await this.client.post<TelegramBotApiResponse<any>>(
      '/answerCallbackQuery',
      {
        callback_query_id: callbackQueryId,
        ...options,
      }
    );
    if (!response.data.ok) {
      throw new Error(`Telegram API Error: ${response.data.description}`);
    }
  }

  async setWebhook(url: string): Promise<void> {
    const response = await this.client.post<TelegramBotApiResponse<any>>('/setWebhook', {
      url,
    });
    if (!response.data.ok) {
      throw new Error(`Telegram API Error: ${response.data.description}`);
    }
  }

  async deleteWebhook(): Promise<void> {
    const response = await this.client.post<TelegramBotApiResponse<any>>('/deleteWebhook');
    if (!response.data.ok) {
      throw new Error(`Telegram API Error: ${response.data.description}`);
    }
  }
}
