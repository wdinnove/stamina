import { supabase } from './client';
import type { SessionTeam, SessionTeamBlock } from '../data/types';

function toBlock(row: Record<string, unknown>): SessionTeamBlock {
  return {
    id:        row.id         as string,
    sessionId: row.session_id as string,
    label:     row.label      as string,
    position:  row.position   as number,
  };
}

function toTeam(row: Record<string, unknown>): SessionTeam {
  return {
    id:        row.id         as string,
    blockId:   row.block_id   as string,
    sessionId: row.session_id as string,
    name:      row.name       as string,
    color:     row.color      as string,
    position:  row.position   as number,
  };
}

export interface SessionTeamWithPlayers {
  name: string;
  color: string;
  playerIds: string[];
}

export interface SessionTeamBlockDraft {
  label: string;
  teams: SessionTeamWithPlayers[];
}

export const sessionTeamsApi = {
  async list(sessionId: string): Promise<{
    blocks: SessionTeamBlock[];
    teamsByBlock: Record<string, SessionTeam[]>;
    playersByTeam: Record<string, string[]>;
  }> {
    const { data: blockRows, error: blockErr } = await supabase
      .from('session_team_blocks')
      .select('*')
      .eq('session_id', sessionId)
      .order('position');
    if (blockErr) throw blockErr;
    const blocks = (blockRows ?? []).map(toBlock);

    const { data: teamRows, error: teamErr } = await supabase
      .from('session_teams')
      .select('*')
      .eq('session_id', sessionId)
      .order('position');
    if (teamErr) throw teamErr;
    const teamsByBlock: Record<string, SessionTeam[]> = {};
    (teamRows ?? []).map(toTeam).forEach(t => { (teamsByBlock[t.blockId] ??= []).push(t); });

    const { data: playerRows, error: playerErr } = await supabase
      .from('session_team_players')
      .select('session_team_id, player_id')
      .eq('session_id', sessionId);
    if (playerErr) throw playerErr;
    const playersByTeam: Record<string, string[]> = {};
    (playerRows ?? []).forEach(r => {
      const teamId = r.session_team_id as string;
      (playersByTeam[teamId] ??= []).push(r.player_id as string);
    });

    return { blocks, teamsByBlock, playersByTeam };
  },

  // Remplace intégralement tous les blocs d'équipes existants pour la séance (delete + insert).
  async saveBlocks(sessionId: string, blocks: SessionTeamBlockDraft[]): Promise<SessionTeamBlock[]> {
    const { error: delErr } = await supabase.from('session_team_blocks').delete().eq('session_id', sessionId);
    if (delErr) throw delErr;
    if (blocks.length === 0) return [];

    const { data: insertedBlocks, error: blockErr } = await supabase
      .from('session_team_blocks')
      .insert(blocks.map((b, i) => ({ session_id: sessionId, label: b.label, position: i })))
      .select();
    if (blockErr) throw blockErr;
    const blockRows = (insertedBlocks ?? []).map(toBlock);

    const teamsToInsert = blockRows.flatMap((b, bi) =>
      blocks[bi].teams.map((t, ti) => ({
        block_id: b.id, session_id: sessionId, name: t.name, color: t.color, position: ti,
      }))
    );
    if (teamsToInsert.length === 0) return blockRows;

    const { data: insertedTeams, error: teamErr } = await supabase
      .from('session_teams')
      .insert(teamsToInsert)
      .select();
    if (teamErr) throw teamErr;
    const teamRows = (insertedTeams ?? []).map(toTeam);

    const playerRows: { block_id: string; session_id: string; session_team_id: string; player_id: string }[] = [];
    let cursor = 0;
    blockRows.forEach((b, bi) => {
      blocks[bi].teams.forEach(t => {
        const teamRow = teamRows[cursor]; cursor++;
        t.playerIds.forEach(playerId => {
          playerRows.push({ block_id: b.id, session_id: sessionId, session_team_id: teamRow.id, player_id: playerId });
        });
      });
    });
    if (playerRows.length > 0) {
      const { error: papErr } = await supabase.from('session_team_players').insert(playerRows);
      if (papErr) throw papErr;
    }
    return blockRows;
  },
};
