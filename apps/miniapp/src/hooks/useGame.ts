import React from 'react';

export const useGame = (gameId: string) => {
  const [gameState, setGameState] = React.useState<any>(null);
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    const ws = new WebSocket(`ws://localhost:3000/api/games/${gameId}`);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setGameState(data);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [gameId]);

  const sendAction = (action: any) => {
    // WebSocket message will be sent here
  };

  return { gameState, connected, sendAction };
};
