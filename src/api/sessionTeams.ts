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

interface SessionTeamWithPlayers {
  /** Identifiant de la ligne. Fourni par l'écran, qui le génère à la création de l'équipe et
   *  le conserve ensuite — c'est ce qui rend l'enregistrement stable. */
  id: string;
  name: string;
  color: string;
  playerIds: string[];
}

export interface SessionTeamBlockDraft {
  id: string;
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

  /**
   * Enregistre les groupes d'équipes du jour EN CONSERVANT LES IDENTIFIANTS.
   *
   * L'enregistrement était un delete + insert intégral : chaque sauvegarde regénérait les
   * identifiants des groupes. Une séquence qui pointe vers un groupe
   * (`session_blocks.team_block_id`) aurait donc perdu son lien au premier enregistrement des
   * équipes, sans rien dire — la clé étrangère est `ON DELETE SET NULL`.
   *
   * Les identifiants viennent de l'écran, qui les génère à la création et les garde tant que
   * la ligne vit. Insérer avec un identifiant fourni est légal, et c'est ce qui permet à un
   * groupe tout juste créé d'être déjà référençable.
   *
   * Les affectations de joueurs, elles, se remplacent en bloc : rien ne les référence, et les
   * comparer ligne à ligne coûterait plus cher que de les réécrire.
   */
  async saveBlocks(sessionId: string, blocks: SessionTeamBlockDraft[]): Promise<SessionTeamBlock[]> {
    const blockIds = blocks.map(b => b.id);
    const teamIds  = blocks.flatMap(b => b.teams.map(t => t.id));

    // Ce que l'écran ne renvoie plus a été supprimé par l'utilisateur. Les équipes et les
    // joueurs des groupes retirés partent en cascade.
    const delBlocks = supabase.from('session_team_blocks').delete().eq('session_id', sessionId);
    const { error: delBlockErr } = await (blockIds.length
      ? delBlocks.not('id', 'in', `(${blockIds.join(',')})`)
      : delBlocks);
    if (delBlockErr) throw delBlockErr;

    if (blocks.length === 0) return [];

    const delTeams = supabase.from('session_teams').delete().eq('session_id', sessionId);
    const { error: delTeamErr } = await (teamIds.length
      ? delTeams.not('id', 'in', `(${teamIds.join(',')})`)
      : delTeams);
    if (delTeamErr) throw delTeamErr;

    const { data: upsertedBlocks, error: blockErr } = await supabase
      .from('session_team_blocks')
      .upsert(blocks.map((b, i) => ({ id: b.id, session_id: sessionId, label: b.label, position: i })))
      .select();
    if (blockErr) throw blockErr;

    const teamsToUpsert = blocks.flatMap(b =>
      b.teams.map((t, ti) => ({
        id: t.id, block_id: b.id, session_id: sessionId, name: t.name, color: t.color, position: ti,
      }))
    );
    if (teamsToUpsert.length > 0) {
      const { error: teamErr } = await supabase.from('session_teams').upsert(teamsToUpsert);
      if (teamErr) throw teamErr;
    }

    const { error: delPlayersErr } = await supabase
      .from('session_team_players').delete().eq('session_id', sessionId);
    if (delPlayersErr) throw delPlayersErr;

    const playerRows = blocks.flatMap(b =>
      b.teams.flatMap(t => t.playerIds.map(playerId => ({
        block_id: b.id, session_id: sessionId, session_team_id: t.id, player_id: playerId,
      })))
    );
    if (playerRows.length > 0) {
      const { error: papErr } = await supabase.from('session_team_players').insert(playerRows);
      if (papErr) throw papErr;
    }

    return (upsertedBlocks ?? []).map(toBlock);
  },
};
