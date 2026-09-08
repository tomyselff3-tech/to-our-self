import { GameStatus, GameSessionId } from '@to-our-self/shared';

type StateTransition = {
  from: GameStatus;
  to: GameStatus;
  guard?: () => boolean;
};

const VALID_TRANSITIONS: StateTransition[] = [
  { from: 'waiting', to: 'starting' },
  { from: 'starting', to: 'active' },
  { from: 'active', to: 'resolving' },
  { from: 'resolving', to: 'result' },
  { from: 'result', to: 'active' }, // Next round
  { from: 'result', to: 'finished' },
];

export class GameStateMachine {
  private currentStatus: GameStatus;

  constructor(initialStatus: GameStatus = 'waiting') {
    this.currentStatus = initialStatus;
  }

  getCurrentStatus(): GameStatus {
    return this.currentStatus;
  }

  canTransitionTo(nextStatus: GameStatus): boolean {
    return VALID_TRANSITIONS.some(
      (t) => t.from === this.currentStatus && t.to === nextStatus && (!t.guard || t.guard())
    );
  }

  transitionTo(nextStatus: GameStatus): void {
    if (!this.canTransitionTo(nextStatus)) {
      throw new Error(
        `Invalid state transition from ${this.currentStatus} to ${nextStatus}`
      );
    }
    this.currentStatus = nextStatus;
  }

  reset(): void {
    this.currentStatus = 'waiting';
  }
}
