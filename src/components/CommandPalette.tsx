import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Command } from 'cmdk';
import { Search, Settings, Dumbbell, Trophy } from 'lucide-react';
import { navGroups } from '../layout/Sidebar';
import { playersApi, attendanceApi, matchesApi } from '../api';
import { useTeamSeason, type TeamSeasonOption } from '../contexts/TeamSeasonContext';
import { PlayerAvatar } from './PlayerAvatar';
import { fmtDate, fmtDateShort, fmtDateWithDay, fmtDateFull } from '../utils/dateFormat';
import type { Player, TrainingSession, Match, Team, Season } from '../data/types';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PlayerHit { player: Player; team: Team; season: Season }

const groupStyle: React.CSSProperties = { marginBottom: 4 };
const itemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
  color: '#E6E9EF', fontSize: '0.85rem',
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  training: 'Entraînement', match: 'Match', gym: 'Gym', rest: 'Repos',
};

/** Toutes les formes sous lesquelles une date peut être tapée ("12/07", "12 juil", "Dimanche"…) */
function dateKeywords(iso: string): string[] {
  return [iso, fmtDate(iso), fmtDateShort(iso), fmtDateWithDay(iso), fmtDateFull(iso)];
}

/**
 * Une joueuse retrouvée sur plusieurs saisons d'une même équipe ne doit apparaître qu'une
 * fois (la saison la plus récente) ; si elle est sur plusieurs équipes, une ligne par
 * équipe, chacune sur sa saison la plus récente.
 */
function dedupeLatestPerTeam(hits: PlayerHit[]): PlayerHit[] {
  const byTeamPlayer = new Map<string, PlayerHit>();
  for (const hit of hits) {
    const key = `${hit.team.id}::${hit.player.id}`;
    const current = byTeamPlayer.get(key);
    if (!current || hit.season.startDate > current.season.startDate) byTeamPlayer.set(key, hit);
  }
  return [...byTeamPlayer.values()];
}

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * cmdk utilise par défaut un score flou (sous-séquence de lettres, à la façon d'un fuzzy
 * finder de code), ce qui fait remonter des matchs/dates sans rapport avec la saisie
 * ("ASVEL" matchait par ex. d'autres adversaires). On veut une vraie sous-chaîne ici.
 */
function substringFilter(value: string, search: string, keywords?: string[]): number {
  const q = normalize(search.trim());
  if (!q) return 1;
  const haystacks = [value, ...(keywords ?? [])].map(normalize);
  return haystacks.some(h => h.includes(q)) ? 1 : 0;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { selected, orgRole, options, setSelected } = useTeamSeason();
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [otherSeasonPlayers, setOtherSeasonPlayers] = useState<PlayerHit[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    if (!selected) return;
    const { team, season } = selected;
    playersApi.listBySeason(season.id).then(setPlayers).catch(() => setPlayers([]));
    attendanceApi.listSessions(team.id, season.id)
      .then(list => setSessions([...list].sort((a, b) => b.date.localeCompare(a.date))))
      .catch(() => setSessions([]));
    matchesApi.listBySeason(team.id, season.id)
      .then(list => setMatches([...list].sort((a, b) => b.date.localeCompare(a.date))))
      .catch(() => setMatches([]));

    // Joueuses des autres équipes/saisons (y compris les années précédentes, y compris
    // les saisons passées de l'équipe active) — pour retrouver une joueuse qui n'est plus
    // dans l'effectif actuel et basculer directement sur le bon contexte équipe/saison.
    const otherOptions = options.filter(o => !(o.team.id === team.id && o.season.id === season.id));
    Promise.all(otherOptions.map(o =>
      playersApi.listBySeason(o.season.id).then(list => list.map((player): PlayerHit => ({ player, team: o.team, season: o.season })))
    )).then(lists => setOtherSeasonPlayers(dedupeLatestPerTeam(lists.flat()))).catch(() => setOtherSeasonPlayers([]));
  }, [open, selected?.team.id, selected?.season.id, options]);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  // Changer d'équipe/saison recharge la page entière — même comportement que le
  // sélecteur de la topbar, nécessaire pour rester synchronisé avec le localStorage.
  const selectTeamSeason = (opt: TeamSeasonOption) => {
    onOpenChange(false);
    setSelected(opt);
    window.location.reload();
  };

  // Joueuse d'une autre équipe : bascule d'équipe/saison puis atterrit directement sur sa fiche.
  const openCrossTeamPlayer = (hit: PlayerHit) => {
    onOpenChange(false);
    setSelected({ team: hit.team, season: hit.season });
    window.location.href = `/players/${hit.player.id}`;
  };

  // Séances et matchs ne s'affichent qu'une fois une recherche tapée (sinon ils noient
  // le résultat sous des dizaines d'entrées dès l'ouverture de la palette).
  const showTemporal = query.trim().length > 0;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Recherche globale"
      shouldFilter
      filter={substringFilter}
      loop
      overlayClassName="cmdk-overlay"
      contentClassName="cmdk-content"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid #21252E' }}>
        <Search size={16} style={{ color: '#5B6472', flexShrink: 0 }} />
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Rechercher une joueuse, un match, une date, une page…"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#E6E9EF', fontSize: 15 }}
        />
        <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#5B6472', border: '1px solid #262B35', borderRadius: 4, padding: '1px 5px' }}>
          esc
        </span>
      </div>

      <Command.List style={{ maxHeight: 420, overflowY: 'auto', padding: 8 }}>
        <Command.Empty style={{ padding: '30px 16px', textAlign: 'center', color: '#5B6472', fontSize: '0.8rem' }}>
          Aucun résultat.
        </Command.Empty>

        {(players.length > 0 || (showTemporal && otherSeasonPlayers.length > 0)) && (
          <Command.Group heading="Joueuses" style={groupStyle}>
            {players.map(p => (
              <Command.Item
                key={p.id}
                value={`${p.firstName} ${p.lastName}`}
                onSelect={() => go(`/players/${p.id}`)}
                style={itemStyle}
              >
                <PlayerAvatar player={p} size={22} />
                <span>{p.firstName} {p.lastName}</span>
              </Command.Item>
            ))}
            {/* Autres équipes/saisons (dont les années précédentes) : seulement une fois une
                recherche tapée (sinon ça double/triple le roster affiché à l'ouverture). */}
            {showTemporal && otherSeasonPlayers.map(({ player: p, team, season }) => (
              <Command.Item
                key={`${team.id}-${season.id}-${p.id}`}
                value={`${p.firstName} ${p.lastName} — ${team.name} ${season.label}`}
                keywords={[p.firstName, p.lastName, team.name, season.label]}
                onSelect={() => openCrossTeamPlayer({ player: p, team, season })}
                style={itemStyle}
              >
                <PlayerAvatar player={p} size={22} />
                <span style={{ flex: 1 }}>{p.firstName} {p.lastName}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569', fontSize: '0.68rem' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: team.color, flexShrink: 0 }} />
                  {team.name} · {season.label}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {showTemporal && options.length > 0 && (
          <Command.Group heading="Équipes" style={groupStyle}>
            {options.map(opt => {
              const isActive = selected?.team.id === opt.team.id && selected?.season.id === opt.season.id;
              return (
                <Command.Item
                  key={`${opt.team.id}-${opt.season.id}`}
                  value={`${opt.team.name} — ${opt.season.label}`}
                  keywords={[opt.team.name, opt.team.category, opt.season.label, opt.season.isCurrent ? 'en cours' : '']}
                  onSelect={() => selectTeamSeason(opt)}
                  style={itemStyle}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: opt.team.color, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{opt.team.name} — {opt.season.label}</span>
                  {isActive && <span style={{ color: '#475569', fontSize: '0.68rem' }}>Actuelle</span>}
                  {!isActive && opt.season.isCurrent && <span style={{ color: '#00E5A0', fontSize: '0.68rem' }}>En cours</span>}
                </Command.Item>
              );
            })}
          </Command.Group>
        )}

        {showTemporal && matches.length > 0 && (
          <Command.Group heading="Matchs" style={groupStyle}>
            {matches.map(m => (
              <Command.Item
                key={m.id}
                value={`vs ${m.opponent} — ${fmtDateFull(m.date)}`}
                keywords={[m.opponent, ...dateKeywords(m.date)]}
                onSelect={() => go(`/matches/${m.id}`)}
                style={itemStyle}
              >
                <Trophy size={16} style={{ color: m.result === 'win' ? '#00E5A0' : '#EF4444', flexShrink: 0 }} />
                <span>vs {m.opponent} — {fmtDateWithDay(m.date)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {showTemporal && sessions.length > 0 && (
          <Command.Group heading="Séances" style={groupStyle}>
            {sessions.map(s => (
              <Command.Item
                key={s.id}
                value={`Séance ${SESSION_TYPE_LABELS[s.sessionType] ?? s.sessionType} — ${fmtDateFull(s.date)}`}
                keywords={dateKeywords(s.date)}
                onSelect={() => go(`/sessions/${s.id}`)}
                style={itemStyle}
              >
                <Dumbbell size={16} style={{ color: '#00E5A0', flexShrink: 0 }} />
                <span>{SESSION_TYPE_LABELS[s.sessionType] ?? s.sessionType} — {fmtDateWithDay(s.date)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {navGroups.map((group, gi) => (
          <Command.Group key={gi} heading={group.title ?? 'Général'} style={groupStyle}>
            {group.items.map(item => (
              <Command.Item key={item.path} value={item.label} onSelect={() => go(item.path)} style={itemStyle}>
                <item.icon size={16} style={{ color: '#3B82F6', flexShrink: 0 }} />
                <span>{item.label}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ))}

        {orgRole === 'admin' && (
          <Command.Group heading="Réglages" style={groupStyle}>
            <Command.Item value="Configuration" onSelect={() => go('/configuration')} style={itemStyle}>
              <Settings size={16} style={{ color: '#3B82F6', flexShrink: 0 }} />
              <span>Configuration</span>
            </Command.Item>
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
