import React from 'react';
import { useAuth } from './hooks/useAuth';
import './App.css';

export const App: React.FC = () => {
  const { token, user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!token) {
    return <div className="error">Failed to authenticate</div>;
  }

  return (
    <div className="app">
      <header>
        <h1>🎮 To Our Self</h1>
        <p>Welcome, {user?.firstName}!</p>
      </header>
      <main>
        <div className="games-grid">
          <GameCard title="🎡 Roulette" description="Spin and win!" gameId="roulette" />
          <GameCard title="🕵️ Mafia" description="Find the impostor" gameId="mafia" />
          <GameCard title="🎲 Dice" description="Roll and bet" gameId="dice" />
          <GameCard title="🪑 Chairs" description="Musical chairs" gameId="chairs" />
          <GameCard title="🙈 Hide & Seek" description="Find the hiders" gameId="hide_and_seek" />
        </div>
      </main>
    </div>
  );
};

const GameCard: React.FC<{ title: string; description: string; gameId: string }> = ({
  title,
  description,
  gameId,
}) => {
  return (
    <div className="game-card">
      <h3>{title}</h3>
      <p>{description}</p>
      <button>Play Now</button>
    </div>
  );
};
