import { GameSessionId, UserId } from '@to-our-self/shared';

export interface AIDecision {
  actionType: string;
  payload: Record<string, unknown>;
}

export class AIPlayer {
  private name: string;
  private difficulty: 'easy' | 'medium' | 'hard';
  private sessionId: GameSessionId;
  private gameState: Record<string, unknown> = {};

  constructor(name: string, difficulty: 'easy' | 'medium' | 'hard', sessionId: GameSessionId) {
    this.name = name;
    this.difficulty = difficulty;
    this.sessionId = sessionId;
  }

  async makeDecision(gameState: Record<string, unknown>): Promise<AIDecision> {
    this.gameState = gameState;

    switch (this.difficulty) {
      case 'easy':
        return this.easyDecision();
      case 'medium':
        return this.mediumDecision();
      case 'hard':
        return this.hardDecision();
    }
  }

  private easyDecision(): AIDecision {
    // Random decisions
    const actions = [
      { type: 'place_bet', params: { number: Math.floor(Math.random() * 37), amount: 10 } },
      { type: 'vote', params: { targetId: Math.floor(Math.random() * 10) } },
      { type: 'wait', params: {} },
    ];
    const action = actions[Math.floor(Math.random() * actions.length)];
    return {
      actionType: action.type,
      payload: action.params,
    };
  }

  private mediumDecision(): AIDecision {
    // Strategy-based decisions
    if ((this.gameState as any).phase === 'betting') {
      return {
        actionType: 'place_bet',
        payload: {
          number: Math.floor(Math.random() * 37),
          amount: Math.random() > 0.5 ? 20 : 10,
        },
      };
    }
    return this.easyDecision();
  }

  private hardDecision(): AIDecision {
    // Advanced strategy
    const history = (this.gameState as any).history || [];
    const frequency: Record<number, number> = {};

    history.forEach((result: number) => {
      frequency[result] = (frequency[result] || 0) + 1;
    });

    const mostFrequent = Object.entries(frequency).sort((a, b) => b[1] - a[1])[0]?.[0];
    const betNumber = mostFrequent ? parseInt(mostFrequent, 10) : Math.floor(Math.random() * 37);

    return {
      actionType: 'place_bet',
      payload: {
        number: betNumber,
        amount: 50,
      },
    };
  }
}

const AI_NAMES = [
  'AlexAI',
  'BotMaster',
  'SmartBot',
  'GamePro',
  'WinBot',
  'CleverAI',
  'SwiftBot',
  'MindBot',
];

export function generateAIName(): string {
  return AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)];
}
