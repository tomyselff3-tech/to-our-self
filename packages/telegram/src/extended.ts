import { TelegramBotClient } from '@to-our-self/telegram';

export class TelegramBotClientExtended extends TelegramBotClient {
  async getUpdates(offset: number = 0, timeout: number = 30): Promise<any[]> {
    const response = await (this as any).client.get('/getUpdates', {
      params: {
        offset,
        timeout,
      },
    });
    return response.data.result || [];
  }
}
