import { supabase } from './client';
import type { Match, MatchStat, TeamMatchStat, OpponentMatchStat } from '../data/types';

export interface BulkStatRow {
  playerId: string;
  starter?: boolean;
  min: number;
  fg2m: number; fg2a: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  ro: number; rd: number;
  pd: number; ct: number;
  intercepts: number; bp: number;
  fte: number; fpr: number;
  eval?: number | null;
  plusMinus?: number | null;
}

export interface OpponentStatInput {
  playerName: string;
  min: number;
  fg2m: number; fg2a: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  ro: number; rd: number;
  pd: number; ct: number;
  intercepts: number; bp: number;
  fte: number; fpr: number;
  eval: number | null;
  plusMinus: number | null;
}

export interface CollectiveStatInput {
  fg2m: number; fg2a: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  ro: number; rd: number;
  pd: number; ct: number;
  intercepts: number; bp: number;
  fte: number;
  fpr: number;
  possessions: number;
}

export interface ListMatchStatsFilters {
  playerId?: string;
  from?: string;
  to?: string;
  result?: 'win' | 'loss';
}

export interface ListTeamMatchStatsFilters {
  from?: string;
  to?: string;
  result?: 'win' | 'loss';
}

export const statsApi = {
  // ─── Stats individuelles ──────────────────────────────────────────────────

  async listMatchStats(filters: ListMatchStatsFilters = {}): Promise<MatchStat[]> {
    let query = supabase.from('match_stats').select('*');
    if (filters.playerId) query = query.eq('player_id', filters.playerId);
    if (filters.from)     query = query.gte('date', filters.from);
    if (filters.to)       query = query.lte('date', filters.to);
    if (filters.result)   query = query.eq('result', filters.result);
    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toMatchStat);
  },

  async getPlayerStats(playerId: string): Promise<MatchStat[]> {
    const { data, error } = await supabase
      .from('match_stats')
      .select('*')
      .eq('player_id', playerId)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toMatchStat);
  },

  async getPlayerStatsBySeason(playerId: string, seasonId: string): Promise<MatchStat[]> {
    const { data: matchRows, error: matchErr } = await supabase
      .from('matches')
      .select('id, score_us, score_them, result')
      .eq('season_id', seasonId);
    if (matchErr) throw matchErr;
    const matchScoreMap = new Map(
      (matchRows ?? []).map((m: { id: string; score_us: number; score_them: number; result: string }) =>
        [m.id, { score_us: m.score_us, score_them: m.score_them, result: m.result }]
      )
    );
    const matchIds = [...matchScoreMap.keys()];
    if (matchIds.length === 0) return [];
    const { data, error } = await supabase
      .from('match_stats')
      .select('*')
      .eq('player_id', playerId)
      .in('match_id', matchIds)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(row => {
      const matchData = row.match_id ? matchScoreMap.get(row.match_id) : undefined;
      if (matchData) {
        return toMatchStat({ ...row, score_us: matchData.score_us, score_them: matchData.score_them, result: matchData.result });
      }
      return toMatchStat(row);
    });
  },

  async createMatchStat(input: Omit<MatchStat, 'id' | 'pts'>): Promise<MatchStat> {
    // pts est une colonne GENERATED ALWAYS AS (fg2m*2 + fg3m*3 + ftm) côté DB
    const { data, error } = await supabase
      .from('match_stats')
      .insert({
        player_id:   input.playerId,
        date:        input.date,
        opponent:    input.opponent,
        home_away:   input.homeAway,
        competition: input.competition,
        result:      input.result,
        score_us:    input.scoreUs,
        score_them:  input.scoreThem,
        starter:     input.starter,
        min:         input.min,
        fg2m:        input.fg2m,
        fg2a:        input.fg2a,
        fg3m:        input.fg3m,
        fg3a:        input.fg3a,
        ftm:         input.ftm,
        fta:         input.fta,
        ro:          input.ro,
        rd:          input.rd,
        pd:          input.pd,
        ct:          input.ct,
        intercepts:  input.intercepts,
        bp:          input.bp,
        fte:         input.fte,
        fpr:         input.fpr,
        eval:        input.eval,
        plus_minus:  input.plusMinus,
      })
      .select()
      .single();
    if (error) throw error;
    return toMatchStat(data);
  },

  // ─── Stats collectives ────────────────────────────────────────────────────

  async listTeamMatchStats(filters: ListTeamMatchStatsFilters = {}): Promise<TeamMatchStat[]> {
    let query = supabase.from('team_match_stats').select('*');
    if (filters.from)   query = query.gte('date', filters.from);
    if (filters.to)     query = query.lte('date', filters.to);
    if (filters.result) query = query.eq('result', filters.result);
    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toTeamMatchStat);
  },

  async getTeamMatchStatByDate(date: string, opponent: string): Promise<TeamMatchStat | null> {
    const { data, error } = await supabase
      .from('team_match_stats_full')
      .select('*')
      .eq('date', date)
      .eq('opponent', opponent)
      .maybeSingle();
    if (error) throw error;
    return data ? toTeamMatchStat(data) : null;
  },

  // ─── Par match_id ─────────────────────────────────────────────────────────

  async listByMatchId(matchId: string): Promise<MatchStat[]> {
    const { data, error } = await supabase
      .from('match_stats')
      .select('*')
      .eq('match_id', matchId)
      .order('min', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toMatchStat);
  },

  async bulkUpsertForMatch(matchId: string, rows: BulkStatRow[], match: Match): Promise<void> {
    if (rows.length === 0) return;
    // Supprime les stats individuelles existantes du match avant réimport
    // (évite les lignes orphelines si le mapping joueur a changé)
    const { error: delErr } = await supabase
      .from('match_stats')
      .delete()
      .eq('match_id', matchId);
    if (delErr) throw delErr;

    const records = rows.map(r => ({
      match_id:    matchId,
      player_id:   r.playerId,
      date:        match.date,
      opponent:    match.opponent,
      home_away:   match.homeAway,
      competition: match.competition,
      result:      match.result,
      score_us:    match.scoreUs,
      score_them:  match.scoreThem,
      starter:     r.starter ?? false,
      min:         r.min,
      fg2m: r.fg2m, fg2a: r.fg2a,
      fg3m: r.fg3m, fg3a: r.fg3a,
      ftm:  r.ftm,  fta:  r.fta,
      ro: r.ro, rd: r.rd,
      pd: r.pd, ct: r.ct,
      intercepts: r.intercepts, bp: r.bp,
      fte: r.fte, fpr: r.fpr,
      eval:       r.eval ?? null,
      plus_minus: r.plusMinus ?? null,
    }));
    const { error } = await supabase
      .from('match_stats')
      .insert(records);
    if (error) throw error;
  },

  async listTeamStatsByMatchIds(matchIds: string[]): Promise<TeamMatchStat[]> {
    if (matchIds.length === 0) return [];
    const { data, error } = await supabase
      .from('team_match_stats_full')
      .select('*')
      .in('match_id', matchIds);
    if (error) throw error;
    return (data ?? []).map(toTeamMatchStat);
  },

  async getTeamStatsByMatchId(matchId: string): Promise<TeamMatchStat | null> {
    const { data, error } = await supabase
      .from('team_match_stats_full')
      .select('*')
      .eq('match_id', matchId)
      .maybeSingle();
    if (error) throw error;
    return data ? toTeamMatchStat(data) : null;
  },

  // ─── Stats individuelles adverses ────────────────────────────────────────────

  async listOpponentStatsByMatchId(matchId: string): Promise<OpponentMatchStat[]> {
    const { data, error } = await supabase
      .from('opponent_match_stats')
      .select('*')
      .eq('match_id', matchId)
      .order('pts', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toOpponentMatchStat);
  },

  async bulkUpsertOpponentStatsForMatch(matchId: string, rows: OpponentStatInput[]): Promise<void> {
    const { error: delErr } = await supabase
      .from('opponent_match_stats')
      .delete()
      .eq('match_id', matchId);
    if (delErr) throw delErr;
    if (rows.length === 0) return;
    const { error } = await supabase
      .from('opponent_match_stats')
      .insert(rows.map(r => ({
        match_id:   matchId,
        player_name: r.playerName,
        min:        r.min,
        fg2m: r.fg2m, fg2a: r.fg2a,
        fg3m: r.fg3m, fg3a: r.fg3a,
        ftm:  r.ftm,  fta:  r.fta,
        ro: r.ro, rd: r.rd,
        pd: r.pd, ct: r.ct,
        intercepts: r.intercepts, bp: r.bp,
        fte: r.fte, fpr: r.fpr,
        eval:       r.eval,
        plus_minus: r.plusMinus,
      })));
    if (error) throw error;
  },

  async getPlayerStatsGroupedBySeason(playerId: string): Promise<{ seasonId: string; seasonLabel: string; teamId: string; teamName: string; stats: MatchStat[] }[]> {
    const { data: statsData, error: statsErr } = await supabase
      .from('match_stats')
      .select('*')
      .eq('player_id', playerId)
      .not('match_id', 'is', null);
    if (statsErr) throw statsErr;
    const stats = (statsData ?? []).map(toMatchStat);
    const matchIds = [...new Set(stats.map(s => s.matchId).filter(Boolean) as string[])];
    if (matchIds.length === 0) return [];
    const { data: matchData, error: matchErr } = await supabase
      .from('matches')
      .select('id, season_id, seasons(label, team_id, teams(name))')
      .in('id', matchIds);
    if (matchErr) throw matchErr;
    const matchSeasonMap = new Map<string, { seasonId: string; seasonLabel: string; teamId: string; teamName: string }>();
    for (const m of matchData ?? []) {
      const row = m as unknown as { id: string; season_id: string; seasons: { label: string; team_id: string; teams: { name: string } | null } | null };
      matchSeasonMap.set(row.id, {
        seasonId: row.season_id,
        seasonLabel: row.seasons?.label ?? row.season_id,
        teamId: row.seasons?.team_id ?? '',
        teamName: row.seasons?.teams?.name ?? '',
      });
    }
    const grouped = new Map<string, { seasonId: string; seasonLabel: string; teamId: string; teamName: string; stats: MatchStat[] }>();
    for (const stat of stats) {
      if (!stat.matchId) continue;
      const season = matchSeasonMap.get(stat.matchId);
      if (!season) continue;
      if (!grouped.has(season.seasonId)) grouped.set(season.seasonId, { ...season, stats: [] });
      grouped.get(season.seasonId)!.stats.push(stat);
    }
    return [...grouped.values()].sort((a, b) => b.seasonLabel.localeCompare(a.seasonLabel));
  },

  async listAllStatsBySeason(teamId: string, seasonId: string): Promise<MatchStat[]> {
    const { data: matchRows, error: matchErr } = await supabase
      .from('matches')
      .select('id')
      .eq('team_id', teamId)
      .eq('season_id', seasonId);
    if (matchErr) throw matchErr;
    const matchIds = (matchRows ?? []).map((m: { id: string }) => m.id);
    if (matchIds.length === 0) return [];
    const { data, error } = await supabase
      .from('match_stats')
      .select('*')
      .in('match_id', matchIds)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toMatchStat);
  },

  async listTeamStatsBySeason(teamId: string, seasonId: string): Promise<TeamMatchStat[]> {
    const { data: matchRows, error: matchErr } = await supabase
      .from('matches')
      .select('id')
      .eq('team_id', teamId)
      .eq('season_id', seasonId);
    if (matchErr) throw matchErr;
    const matchIds = (matchRows ?? []).map((m: { id: string }) => m.id);
    if (matchIds.length === 0) return [];
    const { data, error } = await supabase
      .from('team_match_stats_full')
      .select('*')
      .in('match_id', matchIds)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toTeamMatchStat);
  },

  async upsertTeamStats(matchId: string, own?: CollectiveStatInput, opp?: CollectiveStatInput): Promise<void> {
    const { data: existing } = await supabase
      .from('team_match_stats')
      .select('id')
      .eq('match_id', matchId)
      .maybeSingle();

    const ownFields = own ? {
      fg2m: own.fg2m, fg2a: own.fg2a,
      fg3m: own.fg3m, fg3a: own.fg3a,
      ftm: own.ftm, fta: own.fta,
      ro: own.ro, rd: own.rd,
      pd: own.pd, ct: own.ct,
      intercepts: own.intercepts, bp: own.bp,
      fte: own.fte, fpr: own.fpr,
      possessions: own.possessions,
    } : {};

    const oppFields = opp ? {
      opp_fg2m: opp.fg2m, opp_fg2a: opp.fg2a,
      opp_fg3m: opp.fg3m, opp_fg3a: opp.fg3a,
      opp_ftm: opp.ftm, opp_fta: opp.fta,
      opp_ro: opp.ro, opp_rd: opp.rd,
      opp_pd: opp.pd, opp_ct: opp.ct,
      opp_intercepts: opp.intercepts, opp_bp: opp.bp, opp_fte: opp.fte, opp_fpr: opp.fpr,
      opp_possessions: opp.possessions,
    } : {};

    if (existing) {
      const { error } = await supabase
        .from('team_match_stats')
        .update({ ...ownFields, ...oppFields })
        .eq('match_id', matchId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('team_match_stats')
        .insert({ match_id: matchId, ...ownFields, ...oppFields });
      if (error) throw error;
    }
  },
};

// ─── Mappers ─────────────────────────────────────────────────────────────────

function toMatchStat(row: Record<string, unknown>): MatchStat {
  return {
    id:          row.id          as string,
    matchId:     row.match_id    as string | undefined,
    playerId:    row.player_id   as string,
    date:        row.date        as string,
    opponent:    row.opponent    as string,
    homeAway:    row.home_away   as MatchStat['homeAway'],
    competition: row.competition as string,
    result:      row.result      as MatchStat['result'],
    scoreUs:     row.score_us    as number,
    scoreThem:   row.score_them  as number,
    starter:     row.starter     as boolean,
    min:         row.min         as number,
    pts:         row.pts         as number,
    fg2m:        row.fg2m        as number,
    fg2a:        row.fg2a        as number,
    fg3m:        row.fg3m        as number,
    fg3a:        row.fg3a        as number,
    ftm:         row.ftm         as number,
    fta:         row.fta         as number,
    ro:          row.ro          as number,
    rd:          row.rd          as number,
    pd:          row.pd          as number,
    ct:          row.ct          as number,
    intercepts:  row.intercepts  as number,
    bp:          row.bp          as number,
    fte:         row.fte         as number,
    fpr:         row.fpr         as number,
    eval:        row.eval        as number | null,
    plusMinus:   row.plus_minus  as number | null,
  };
}

function toTeamMatchStat(row: Record<string, unknown>): TeamMatchStat {
  const n = (k: string): number => (row[k] ?? 0) as number;
  return {
    id:            row.id              as string,
    matchId:       row.match_id        as string | undefined,
    date:          row.date            as string,
    opponent:      row.opponent        as string,
    homeAway:      row.home_away       as TeamMatchStat['homeAway'],
    result:        row.result          as TeamMatchStat['result'],
    scoreUs:       n('score_us'),
    scoreThem:     n('score_them'),
    fg2m:          n('fg2m'),
    fg2a:          n('fg2a'),
    fg3m:          n('fg3m'),
    fg3a:          n('fg3a'),
    ftm:           n('ftm'),
    fta:           n('fta'),
    ro:            n('ro'),
    rd:            n('rd'),
    rt:            n('rt'),
    pd:            n('pd'),
    ct:            n('ct'),
    intercepts:    n('intercepts'),
    bp:            n('bp'),
    fte:           n('fte'),
    fpr:           n('fpr'),
    possessions:   n('possessions'),
    offRating:     n('off_rating'),
    defRating:     n('def_rating'),
    efgPct:        n('efg_pct'),
    ftRate:        n('ft_rate'),
    toPct:         n('to_pct'),
    orebPct:       n('oreb_pct'),
    drebPct:       n('dreb_pct'),
    opp_fg2m:      n('opp_fg2m'),
    opp_fg2a:      n('opp_fg2a'),
    opp_fg3m:      n('opp_fg3m'),
    opp_fg3a:      n('opp_fg3a'),
    opp_ftm:       n('opp_ftm'),
    opp_fta:       n('opp_fta'),
    opp_ro:        n('opp_ro'),
    opp_rd:        n('opp_rd'),
    opp_rt:        n('opp_rt'),
    opp_pd:        n('opp_pd'),
    opp_ct:        n('opp_ct'),
    opp_intercepts: n('opp_intercepts'),
    opp_bp:        n('opp_bp'),
    opp_fte:       n('opp_fte'),
    opp_fpr:       n('opp_fpr'),
    opp_possessions: n('opp_possessions'),
    opp_efgPct:    n('opp_efg_pct'),
    opp_toPct:     n('opp_to_pct'),
    opp_orebPct:   n('opp_oreb_pct'),
  };
}

function toOpponentMatchStat(row: Record<string, unknown>): OpponentMatchStat {
  const n = (k: string): number => (row[k] ?? 0) as number;
  return {
    id:         row.id          as string,
    matchId:    row.match_id    as string,
    playerName: row.player_name as string,
    min:        n('min'),
    pts:        n('pts'),
    fg2m:       n('fg2m'),  fg2a: n('fg2a'),
    fg3m:       n('fg3m'),  fg3a: n('fg3a'),
    ftm:        n('ftm'),   fta:  n('fta'),
    ro:         n('ro'),    rd:   n('rd'),
    pd:         n('pd'),    ct:   n('ct'),
    intercepts: n('intercepts'), bp: n('bp'),
    fte:        n('fte'),   fpr:  n('fpr'),
    eval:       row.eval        as number | null,
    plusMinus:  row.plus_minus  as number | null,
  };
}
