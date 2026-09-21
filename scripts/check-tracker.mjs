/**
 * Vérification de bout en bout de la prise de statistiques, CONTRE UNE VRAIE BASE.
 *
 *   E2E_EMAIL=... E2E_PASSWORD=... npx vite-node scripts/check-tracker.mjs
 *
 * Ce que les tests unitaires ne peuvent pas atteindre et que celui-ci couvre : les politiques RLS,
 * les contraintes de cohérence de `match_events`, la sérialisation aller-retour des coordonnées, et
 * le chemin de publication complet (remplacement en bloc compris).
 *
 * Il crée un MATCH JETABLE daté de 2019, travaille dedans, et le supprime — la suppression en
 * cascade emporte actions, rotations, effectif adverse et statistiques publiées. Aucune donnée
 * existante n'est touchée. À n'exécuter que sur un compte de test.
 */
import { supabase } from '../src/api/client.ts';
import { statsApi } from '../src/api/stats.ts';
import { matchesApi } from '../src/api/matches.ts';
import { matchEventsApi } from '../src/api/matchEvents.ts';
import { matchLiveApi } from '../src/api/matchLive.ts';
import { boxscoreFromEvents, teamTotalsFromEvents, scoreFromEvents } from '../src/data/matchEvents.ts';
import { unattributedLine } from '../src/data/boxscoreTotals.ts';
import { zoneStats } from '../src/data/shotChart.ts';
import { playByPlayRows } from '../src/data/playByPlay.ts';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('E2E_EMAIL et E2E_PASSWORD sont requis. Compte de TEST uniquement.');
  process.exit(1);
}

let ok = 0, ko = 0;
const t = (label, cond, detail = '') => {
  cond ? ok++ : ko++;
  console.log(`${cond ? '  ok  ' : '  KO  '} ${label}${detail ? ' → ' + detail : ''}`);
};

const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error('Connexion refusée :', authErr.message); process.exit(1); }

const { data: team }   = await supabase.from('teams').select('id').limit(1).single();
const { data: season } = await supabase.from('seasons').select('id').eq('team_id', team.id).limit(1).single();
const { data: players } = await supabase.from('players').select('id').limit(5);
const five = players.map(p => p.id);
if (five.length < 5) { console.error("L'effectif de test compte moins de cinq joueurs."); process.exit(1); }

const { data: match, error: mErr } = await supabase.from('matches').insert({
  team_id: team.id, season_id: season.id, date: '2019-01-01',
  opponent: 'ZZ VÉRIFICATION AUTOMATIQUE', home_away: 'home', competition: 'TEST',
  result: 'loss', score_us: 0, score_them: 0,
}).select('*').single();
if (mErr) { console.error('Création du match de test impossible :', mErr.message); process.exit(1); }

const M = {
  id: match.id, date: match.date, opponent: match.opponent, homeAway: match.home_away,
  competition: match.competition, kind: match.kind ?? 'championship', result: match.result,
  scoreUs: match.score_us, scoreThem: match.score_them,
};

try {
  console.log('\n── Contraintes de cohérence (ces écritures doivent être REFUSÉES) ──');
  const bad = { match_id: match.id, quarter: 1, game_time_seconds: 1, side: 'us', on_court: [], on_court_them: [] };
  const refused = async (label, row) => {
    const { error } = await supabase.from('match_events').insert(row);
    t(label, !!error, error ? '' : 'ACCEPTÉE — contrainte absente en base');
    if (!error) await supabase.from('match_events').delete().eq('match_id', match.id).eq('seq', row.seq);
  };
  await refused('tir sans réussite',            { ...bad, seq: 900, type: 'shot', x: 7.5, y: 9 });
  await refused('tir avec position ET valeur',  { ...bad, seq: 901, type: 'shot', made: true, x: 7.5, y: 9, value: 3 });
  await refused('rebond avec une réussite',     { ...bad, seq: 902, type: 'reb_def', made: true });
  await refused('rebond avec une position',     { ...bad, seq: 903, type: 'reb_def', x: 7.5, y: 9 });
  await refused('tir hors du terrain (x = 99)', { ...bad, seq: 904, type: 'shot', made: true, x: 99, y: 9 });
  await refused('type d\'action inconnu',       { ...bad, seq: 905, type: 'dunk', made: true, x: 7.5, y: 9 });

  console.log('\n── Durée d\'un quart-temps, portée par le match ──');
  try {
    await matchesApi.update(match.id, { periodDurationSeconds: 480 });
    const reread = await matchesApi.getById(match.id);
    t('durée réglable et relue depuis le match', reread.periodDurationSeconds === 480, `${reread.periodDurationSeconds}s`);
    await matchesApi.update(match.id, { periodDurationSeconds: 600 });
  } catch (e) {
    t('durée réglable et relue depuis le match', false, `migration absente — ${e.message.split('\n')[0].slice(0, 70)}`);
  }

  console.log('\n── Saisie d\'un match ──');
  await matchLiveApi.insertLineupEvent({ matchId: match.id, seq: 1, side: 'us', quarter: 1, gameTimeSeconds: 0, playersIn: five, playersOut: [], onCourt: five });
  const opp = await matchLiveApi.addOpponentPlayer(match.id, 'Dupont', 7);

  const base = { matchId: match.id, quarter: 1, side: 'us', onCourt: five, onCourtThem: [] };
  const written = [
    { ...base, seq: 1, gameTimeSeconds: 10, type: 'shot', made: true,  x: 7.5, y: 9.0, playerId: five[0] },
    { ...base, seq: 2, gameTimeSeconds: 25, type: 'shot', made: true,  x: 7.5, y: 3.0, playerId: five[1] },
    { ...base, seq: 3, gameTimeSeconds: 40, type: 'ft',   made: true,  playerId: five[0] },
    { ...base, seq: 4, gameTimeSeconds: 55, type: 'foul', playerId: five[4] },
    { ...base, seq: 5, gameTimeSeconds: 70, side: 'them', type: 'shot', made: true, value: 2, opponentPlayerId: opp.id },
    { ...base, seq: 6, gameTimeSeconds: 80, side: 'them', type: 'shot', made: true, value: 3 },
    // Rebond d'ÉQUIPE : aucun auteur. Il doit compter aux totaux collectifs et à aucune ligne
    // individuelle — c'est tout l'objet de la ligne « Équipe » du boxscore.
    { ...base, seq: 7, gameTimeSeconds: 90, type: 'reb_def' },
  ];
  for (const e of written) await matchEventsApi.insert(e);

  const back = await matchEventsApi.getByMatchId(match.id);
  t('actions relues', back.length === written.length, `${back.length}`);
  t('coordonnées relues exploitables', typeof back[0].x === 'number' && back[0].x === 7.5, `${typeof back[0].x} ${back[0].x}`);

  const lineups = await matchLiveApi.getLineupEvents(match.id);
  const score = scoreFromEvents(back);
  t('score dérivé 6 — 5', score.us === 6 && score.them === 5, `${score.us} — ${score.them}`);

  const rowsUs   = boxscoreFromEvents(back, lineups, 600, 1, 600, 'us');
  const rowsThem = boxscoreFromEvents(back, lineups, 600, 1, 600, 'them');
  t('cinq titulaires détectés', rowsUs.filter(r => r.starter).length === 5, `${rowsUs.filter(r => r.starter).length}`);
  const p0 = rowsUs.find(r => r.playerId === five[0]);
  t('points et minutes calculés', p0.pts === 4 && p0.min === 10, `pts=${p0.pts} min=${p0.min}`);
  const p4 = rowsUs.find(r => r.playerId === five[4]);
  t('faute commise rangée dans fte', p4.fte === 1 && p4.fpr === 0, `fte=${p4.fte} fpr=${p4.fpr}`);
  t('totaux adverses comptent l\'anonyme', teamTotalsFromEvents(back, 'them').fg3m === 1);
  t('rebond d\'équipe absent des lignes individuelles', rowsUs.every(r => r.rd === 0));
  t('rebond d\'équipe compté aux totaux collectifs', teamTotalsFromEvents(back, 'us').rd === 1);
  t('tir à 3 rangé par zone', zoneStats(back, 'us').find(z => z.zone === 'arc_axe').made === 1);
  const pbp = playByPlayRows(back, { us: 'A', them: 'B', player: () => 'X', opponent: () => 'Y' }, 600);
  t('play-by-play cohérent', pbp.at(-1).slice(10).join('-') === '6-5');
  // Colonne « Temps » en décompte, comme la feuille de marque : 10 s écoulées → 09:50 au tableau.
  t('play-by-play exporté en temps décompté', pbp[0][1] === '09:50', pbp[0][1]);

  // Correction du temps : la politique RLS est en FOR ALL, mais seul un UPDATE réellement exécuté
  // prouve que son WITH CHECK laisse passer la ligne modifiée.
  await matchEventsApi.updateTime(match.id, 1, 42);
  const retimed = await matchEventsApi.getByMatchId(match.id);
  t('temps d\'une action corrigé et relu', retimed.find(e => e.seq === 1).gameTimeSeconds === 42,
    `${retimed.find(e => e.seq === 1).gameTimeSeconds}s`);

  await matchLiveApi.updateLineupEventTime(match.id, 'us', lineups[0].seq, 15);
  const retimedLineups = await matchLiveApi.getLineupEvents(match.id);
  t('temps d\'un changement corrigé et relu',
    retimedLineups.find(l => l.side === 'us' && l.seq === lineups[0].seq).gameTimeSeconds === 15);

  await matchEventsApi.updateTime(match.id, 1, 10);   // remise en place pour la suite
  await matchLiveApi.updateLineupEventTime(match.id, 'us', lineups[0].seq, lineups[0].gameTimeSeconds);

  console.log('\n── Publication ──');
  await statsApi.bulkUpsertForMatch(match.id, rowsUs, { ...M, scoreUs: score.us, scoreThem: score.them, result: 'win' });
  await statsApi.bulkUpsertOpponentStatsForMatch(match.id, rowsThem.map(r => ({
    // `opp.number` (7) : reproduit le bug signalé — la publication perdait le numéro de
    // l'adversaire, faute d'une colonne pour le porter dans `opponent_match_stats`.
    playerName: 'Dupont', number: opp.number, min: r.min, fg2m: r.fg2m, fg2a: r.fg2a, fg3m: r.fg3m, fg3a: r.fg3a,
    ftm: r.ftm, fta: r.fta, ro: r.ro, rd: r.rd, pd: r.pd, ct: r.ct,
    intercepts: r.intercepts, bp: r.bp, fte: r.fte, fpr: r.fpr, eval: r.eval, plusMinus: r.plusMinus,
  })));
  await statsApi.upsertTeamStats(match.id, teamTotalsFromEvents(back, 'us'), teamTotalsFromEvents(back, 'them'));
  await matchesApi.update(match.id, { scoreUs: score.us, scoreThem: score.them, result: 'win' });

  const published = await statsApi.listByMatchId(match.id);
  t('boxscore publié', published.length === rowsUs.length, `${published.length} ligne(s)`);
  const pub0 = published.find(r => r.playerId === five[0]);
  t('titulaire et minutes publiés', pub0.starter === true && Number(pub0.min) === 10, `starter=${pub0.starter} min=${pub0.min}`);
  const publishedOpp = await statsApi.listOpponentStatsByMatchId(match.id);
  t('statistiques adverses publiées', publishedOpp.length === 1);
  t('numéro de l\'adversaire publié et relu', publishedOpp[0]?.number === 7, `number=${publishedOpp[0]?.number}`);
  const teamPub = await statsApi.getTeamStatsByMatchId(match.id);
  t('totaux collectifs publiés', teamPub?.fg3m === 1 && teamPub?.opp_fg3m === 1, `fg3m=${teamPub?.fg3m} opp=${teamPub?.opp_fg3m}`);
  const teamLine = unattributedLine(teamPub, published, 'us');
  t('ligne « Équipe » du boxscore : le rebond sans auteur ressort', teamLine?.rd === 1, `rd=${teamLine?.rd ?? '—'}`);
  const oppLine = unattributedLine(teamPub, publishedOpp, 'them');
  t('ligne « Équipe » adverse : le tir anonyme ressort', oppLine?.fg3m === 1 && oppLine?.pts === 3, `fg3m=${oppLine?.fg3m ?? '—'} pts=${oppLine?.pts ?? '—'}`);

  const updated = await matchesApi.getById(match.id);
  t('score du match mis à jour', updated.scoreUs === 6 && updated.scoreThem === 5, `${updated.scoreUs} — ${updated.scoreThem}`);

  await statsApi.bulkUpsertOpponentStatsForMatch(match.id, []);
  t('publier sans adversaire ne vide plus la table',
    (await statsApi.listOpponentStatsByMatchId(match.id)).length === 1);

  await statsApi.bulkUpsertForMatch(match.id, rowsUs, { ...M, scoreUs: 6, scoreThem: 5, result: 'win' });
  t('republier remplace au lieu de dupliquer',
    (await statsApi.listByMatchId(match.id)).length === rowsUs.length);

} catch (e) {
  ko++;
  console.log('  KO   exception :', e.message);
} finally {
  const { error } = await supabase.from('matches').delete().eq('id', match.id);
  console.log(`\nnettoyage : ${error ? 'ÉCHEC — supprimer à la main le match « ' + M.opponent + ' » : ' + error.message : 'match de test supprimé'}`);
}

console.log(`\n${ok} vérifications OK, ${ko} en échec.`);
process.exit(ko === 0 ? 0 : 1);
