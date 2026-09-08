import { UserId } from '@to-our-self/shared';
import { query, queryOne, transaction } from '@to-our-self/database';
import { addTransaction } from '@to-our-self/economy';

export async function getMissionsForUser(userId: UserId): Promise<any[]> {
  return query(
    `SELECT m.*, pm.progress, pm.completed_at, pm.reward_claimed_at
     FROM missions m
     LEFT JOIN player_missions pm ON pm.mission_id = m.id AND pm.user_id = $1
     WHERE m.created_at >= NOW() - INTERVAL '30 days'
     ORDER BY m.created_at DESC`,
    [userId]
  );
}

export async function updateMissionProgress(
  userId: UserId,
  missionId: string,
  progressDelta: number
): Promise<void> {
  await transaction(async (client) => {
    const mission = await client.query(
      'SELECT * FROM missions WHERE id = $1',
      [missionId]
    );

    if (mission.rows.length === 0) return;

    const m = mission.rows[0];
    const playerMission = await client.query(
      'SELECT * FROM player_missions WHERE user_id = $1 AND mission_id = $2',
      [userId, missionId]
    );

    let newProgress = progressDelta;
    if (playerMission.rows.length > 0) {
      newProgress += playerMission.rows[0].progress;
    } else {
      await client.query(
        'INSERT INTO player_missions (user_id, mission_id, progress) VALUES ($1, $2, $3)',
        [userId, missionId, 0]
      );
    }

    await client.query(
      'UPDATE player_missions SET progress = $1 WHERE user_id = $2 AND mission_id = $3',
      [newProgress, userId, missionId]
    );

    // Check completion
    if (newProgress >= m.condition_target) {
      await client.query(
        'UPDATE player_missions SET completed_at = NOW() WHERE user_id = $1 AND mission_id = $2',
        [userId, missionId]
      );
    }
  });
}

export async function claimMissionReward(userId: UserId, missionId: string): Promise<void> {
  await transaction(async (client) => {
    const playerMission = await client.query(
      `SELECT pm.*, m.reward_xp, m.reward_coins
       FROM player_missions pm
       JOIN missions m ON m.id = pm.mission_id
       WHERE pm.user_id = $1 AND pm.mission_id = $2`,
      [userId, missionId]
    );

    if (playerMission.rows.length === 0 || playerMission.rows[0].completed_at === null) {
      throw new Error('Mission not completed');
    }

    if (playerMission.rows[0].reward_claimed_at !== null) {
      throw new Error('Reward already claimed');
    }

    const { reward_xp, reward_coins } = playerMission.rows[0];

    // Add transaction
    await addTransaction(userId, reward_coins, 'MISSION_REWARD', {
      referenceType: 'mission',
      referenceId: missionId,
      metadata: { xp: reward_xp },
    });

    // Update profile XP
    await client.query(
      'UPDATE profiles SET xp = xp + $1 WHERE user_id = $2',
      [reward_xp, userId]
    );

    // Mark as claimed
    await client.query(
      'UPDATE player_missions SET reward_claimed_at = NOW() WHERE user_id = $1 AND mission_id = $2',
      [userId, missionId]
    );
  });
}
