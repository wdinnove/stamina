import { useState, useRef, useEffect } from 'react';
import { X, Upload, AlertCircle, ChevronDown } from 'lucide-react';
import { statsApi } from '../api/stats';
import { matchesApi } from '../api/matches';
import type { Match, Player, TeamMatchStat } from '../data/types';
import type { BulkStatRow, CollectiveStatInput, OpponentStatInput } from '../api/stats';

// ─── Types internes ───────────────────────────────────────────────────────────

interface CsvRow {
  nom: string;
  disq: boolean;
  min: number;
  pts: number;
  fg2m: number; fg2a: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  ro: number; rd: number; rt: number;
  pd: number; ct: number;
  intercepts: number; bp: number;
  fte: number; fpr: number;
  eval: number | null;
  plusMinus: number | null;
}

// ─── Helpers CSV ──────────────────────────────────────────────────────────────

function normCol(h: string): string {
  return h
    .replace(/^﻿/, '')
    .replace(/[​-‍﻿]/g, '')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '');
}

function splitLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === sep && !inQ) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

const COL_MAP: Record<string, keyof CsvRow> = {
  'NOM': 'nom', 'NAME': 'nom', 'JOUEUR': 'nom', 'PLAYER': 'nom',
  '5D': 'disq', 'DQ': 'disq', 'DISQ': 'disq',
  'MIN': 'min', 'MINUTES': 'min', 'TPS': 'min', 'TEMPS': 'min',
  'PTS': 'pts', 'POINTS': 'pts',
  '2R': 'fg2m', 'FG2R': 'fg2m', 'FG2M': 'fg2m', '2PM': 'fg2m', '2PTSREUSSIS': 'fg2m',
  '2T': 'fg2a', 'FG2T': 'fg2a', 'FG2A': 'fg2a', '2PA': 'fg2a', '2PTSTENTES': 'fg2a',
  '3R': 'fg3m', 'FG3R': 'fg3m', 'FG3M': 'fg3m', '3PM': 'fg3m', '3PTSREUSSIS': 'fg3m',
  '3T': 'fg3a', 'FG3T': 'fg3a', 'FG3A': 'fg3a', '3PA': 'fg3a', '3PTSTENTES': 'fg3a',
  'LR': 'ftm', 'FTR': 'ftm', 'FTM': 'ftm', 'LFR': 'ftm', 'LFREUSSIS': 'ftm',
  'LT': 'fta', 'FTT': 'fta', 'FTA': 'fta', 'LFT': 'fta', 'LFTENTES': 'fta',
  'RO': 'ro', 'OR': 'ro', 'OREB': 'ro', 'REBOFF': 'ro', 'REBONDSOFF': 'ro',
  'RD': 'rd', 'DR': 'rd', 'DREB': 'rd', 'REBDEF': 'rd', 'REBONDSDEF': 'rd',
  'RT': 'rt', 'TR': 'rt', 'TREB': 'rt', 'REB': 'rt', 'REBONDSTOTAUX': 'rt',
  'PD': 'pd', 'AST': 'pd', 'ASSISTS': 'pd', 'PASSESDECISIVES': 'pd',
  'CT': 'ct', 'BLK': 'ct', 'BLOCKS': 'ct', 'CONTRES': 'ct',
  'IN': 'intercepts', 'STL': 'intercepts', 'STEALS': 'intercepts', 'INTERCEPTS': 'intercepts', 'INT': 'intercepts',
  'BP': 'bp', 'TO': 'bp', 'TOV': 'bp', 'TURNOVER': 'bp', 'BALLESPERDUES': 'bp',
  'FTE': 'fte', 'PF': 'fte', 'FAUTESRECUES': 'fte', 'FAUTESOBTENUES': 'fte',
  'FPR': 'fpr', 'FC': 'fpr', 'FAUTESCOMMISES': 'fpr', 'FAUTESPERSONNELLES': 'fpr',
  'EVAL': 'eval', 'EFF': 'eval', 'EFFICIENCY': 'eval', 'EVALUATION': 'eval',
  '+/-': 'plusMinus', 'PM': 'plusMinus', 'PLUSMINUS': 'plusMinus', 'PLUS/MINUS': 'plusMinus',
};

function emptyRow(): CsvRow {
  return { nom: '', disq: false, min: 0, pts: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, ro: 0, rd: 0, rt: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0, eval: null, plusMinus: null };
}

interface ParseResult {
  rows: CsvRow[];
  detected: Array<{ raw: string; norm: string; field: keyof CsvRow | null }>;
}

function parseCsv(text: string): ParseResult {
  const cleaned = text.replace(/^﻿/, '').trim();
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], detected: [] };

  const first = lines[0];
  const sep = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ',';

  const colMap: Record<number, keyof CsvRow> = {};
  const detected: ParseResult['detected'] = [];
  splitLine(first, sep).forEach((h, i) => {
    const norm = normCol(h);
    const field = COL_MAP[norm] ?? null;
    detected.push({ raw: h, norm, field });
    if (field) colMap[i] = field;
  });

  const rows = lines.slice(1).map(line => {
    const vals = splitLine(line, sep);
    const row = emptyRow();
    Object.entries(colMap).forEach(([idxStr, field]) => {
      const val = (vals[parseInt(idxStr)] ?? '').replace(/^"|"$/g, '');
      if (!val || val === '-' || val === '') return;
      if (field === 'nom') {
        row.nom = val;
      } else if (field === 'disq') {
        row.disq = val === '1' || val.toLowerCase() === 'oui' || val.toLowerCase() === 'x';
      } else if (field === 'eval' || field === 'plusMinus') {
        const p = parseFloat(val.replace(',', '.'));
        (row as Record<string, unknown>)[field] = isNaN(p) ? null : p;
      } else {
        const p = parseFloat(val.replace(',', '.'));
        (row as Record<string, unknown>)[field] = isNaN(p) ? 0 : p;
      }
    });
    return row;
  }).filter(r => r.nom.trim() !== '');

  return { rows, detected };
}

function calcCollective(rows: CsvRow[]): CollectiveStatInput {
  const s = (k: keyof CsvRow): number =>
    rows.reduce((acc, r) => acc + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);
  const fg2m = s('fg2m'), fg2a = s('fg2a');
  const fg3m = s('fg3m'), fg3a = s('fg3a');
  const ftm  = s('ftm'),  fta  = s('fta');
  const ro   = s('ro'),   rd   = s('rd');
  const bp   = s('bp');
  const possessions = Math.round(((fg2a + fg3a) - ro + bp + 0.44 * fta) * 10) / 10;
  return { fg2m, fg2a, fg3m, fg3a, ftm, fta, ro, rd, pd: s('pd'), ct: s('ct'), intercepts: s('intercepts'), bp, fte: s('fte'), fpr: s('fpr'), possessions };
}

function tryAutoMatch(csvName: string, players: Player[]): string | null {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const cn = norm(csvName);
  for (const p of players) {
    const ln = norm(p.lastName);
    const fn = norm(p.firstName);
    if (cn === ln || cn === fn || cn === `${fn} ${ln}` || cn === `${ln} ${fn}` ||
        cn.startsWith(ln + ' ') || cn.startsWith(ln)) {
      return p.id;
    }
  }
  return null;
}

function pct(m: number, a: number): string {
  if (a === 0) return '—';
  return `${Math.round(m / a * 100)}%`;
}

function emptyCollective(): CollectiveStatInput {
  return { fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, ro: 0, rd: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0, possessions: 0 };
}

function teamStatToCollective(ts: TeamMatchStat, side: 'own' | 'opp'): CollectiveStatInput {
  if (side === 'own') {
    return { fg2m: ts.fg2m, fg2a: ts.fg2a, fg3m: ts.fg3m, fg3a: ts.fg3a, ftm: ts.ftm, fta: ts.fta, ro: ts.ro, rd: ts.rd, pd: ts.pd, ct: ts.ct, intercepts: ts.intercepts, bp: ts.bp, fte: ts.fte, fpr: ts.fpr, possessions: ts.possessions };
  }
  return { fg2m: ts.opp_fg2m, fg2a: ts.opp_fg2a, fg3m: ts.opp_fg3m, fg3a: ts.opp_fg3a, ftm: ts.opp_ftm, fta: ts.opp_fta, ro: ts.opp_ro, rd: ts.opp_rd, pd: ts.opp_pd, ct: ts.opp_ct, intercepts: ts.opp_intercepts, bp: ts.opp_bp, fte: ts.opp_fte, fpr: ts.opp_fpr, possessions: ts.opp_possessions };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: '6px 8px', color: '#475569', fontSize: '0.68rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center',
  whiteSpace: 'nowrap', borderBottom: '1px solid #2A2F3A', backgroundColor: '#161920',
  position: 'sticky', top: 0,
};
const TD: React.CSSProperties = {
  padding: '5px 8px', color: '#94A3B8', fontSize: '0.78rem', textAlign: 'center',
  whiteSpace: 'nowrap', borderBottom: '1px solid rgba(42,47,58,0.5)',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ColDetectionBadges({ detected }: { detected: ParseResult['detected'] }) {
  if (detected.length === 0) return null;
  const unknown = detected.filter(d => !d.field);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '8px 0 0' }}>
      {detected.map((d, i) => (
        <span key={i} style={{
          fontSize: '0.65rem', padding: '2px 6px', borderRadius: 3, fontWeight: 600,
          backgroundColor: d.field ? 'rgba(0,229,160,0.08)' : 'rgba(245,158,11,0.1)',
          color: d.field ? '#00E5A080' : '#F59E0B',
          border: `1px solid ${d.field ? 'rgba(0,229,160,0.15)' : 'rgba(245,158,11,0.3)'}`,
        }}>
          {d.raw || '—'}{d.field ? '' : ' ?'}
        </span>
      ))}
      {unknown.length > 0 && (
        <span style={{ fontSize: '0.65rem', color: '#F59E0B', alignSelf: 'center', marginLeft: 4 }}>
          {unknown.length} colonne{unknown.length > 1 ? 's' : ''} non reconnue{unknown.length > 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

function UploadZone({ onFile, error }: { onFile: (f: File) => void; error: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
          backgroundColor: '#1E2229', border: '1px dashed #2A2F3A', borderRadius: 8,
          color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', width: '100%',
          justifyContent: 'center',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#00E5A0'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2A2F3A'; }}
      >
        <Upload size={14} color="#00E5A0" />
        Choisir un fichier CSV
      </button>
      <input ref={ref} type="file" accept=".csv,.tsv,.txt" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />
      {error && (
        <p style={{ color: '#EF4444', fontSize: '0.75rem', margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertCircle size={12} /> {error}
        </p>
      )}
    </div>
  );
}

function CsvTable({ rows, showMatch, players, playerMap, onPlayerChange }: {
  rows: CsvRow[];
  showMatch: boolean;
  players: Player[];
  playerMap: Record<number, string>;
  onPlayerChange: (idx: number, pid: string) => void;
}) {
  return (
    <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto', border: '1px solid #2A2F3A', borderRadius: 6, marginTop: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
        <thead>
          <tr>
            <th style={{ ...TH, textAlign: 'left', minWidth: 100 }}>NOM</th>
            <th style={TH}>MIN</th>
            <th style={TH}>PTS</th>
            <th style={TH}>2pts</th>
            <th style={{ ...TH, color: '#475569' }}>2%</th>
            <th style={TH}>3pts</th>
            <th style={{ ...TH, color: '#475569' }}>3%</th>
            <th style={TH}>LF</th>
            <th style={{ ...TH, color: '#475569' }}>LF%</th>
            <th style={TH}>RO</th>
            <th style={TH}>RD</th>
            <th style={TH}>RT</th>
            <th style={TH}>PD</th>
            <th style={TH}>CT</th>
            <th style={TH}>IN</th>
            <th style={TH}>BP</th>
            <th style={TH}>FTE</th>
            <th style={TH}>FPR</th>
            <th style={TH}>ÉVAL</th>
            <th style={TH}>+/-</th>
            {showMatch && <th style={{ ...TH, minWidth: 180, textAlign: 'left' }}>Joueur</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const mapped = playerMap[i];
            const isSkip = mapped === '__skip' || !mapped;
            return (
              <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                <td style={{ ...TD, textAlign: 'left', color: '#F1F5F9', fontWeight: 600 }}>
                  {r.disq && <span title="Disqualifié" style={{ color: '#EF4444', marginRight: 4 }}>5D</span>}
                  {r.nom}
                </td>
                <td style={TD}>{r.min}</td>
                <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{r.pts}</td>
                <td style={TD}>{r.fg2m}/{r.fg2a}</td>
                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(r.fg2m, r.fg2a)}</td>
                <td style={TD}>{r.fg3m}/{r.fg3a}</td>
                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(r.fg3m, r.fg3a)}</td>
                <td style={TD}>{r.ftm}/{r.fta}</td>
                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(r.ftm, r.fta)}</td>
                <td style={TD}>{r.ro}</td>
                <td style={TD}>{r.rd}</td>
                <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{r.rt}</td>
                <td style={TD}>{r.pd}</td>
                <td style={TD}>{r.ct}</td>
                <td style={TD}>{r.intercepts}</td>
                <td style={TD}>{r.bp}</td>
                <td style={TD}>{r.fte}</td>
                <td style={TD}>{r.fpr}</td>
                <td style={{ ...TD, color: r.eval !== null ? (r.eval > 0 ? '#00E5A0' : '#EF4444') : '#475569' }}>
                  {r.eval !== null ? r.eval : '—'}
                </td>
                <td style={{ ...TD, color: r.plusMinus !== null ? (r.plusMinus > 0 ? '#00E5A0' : r.plusMinus < 0 ? '#EF4444' : '#94A3B8') : '#475569' }}>
                  {r.plusMinus !== null ? (r.plusMinus > 0 ? `+${r.plusMinus}` : r.plusMinus) : '—'}
                </td>
                {showMatch && (
                  <td style={{ ...TD, textAlign: 'left' }}>
                    <div style={{ position: 'relative' }}>
                      <select
                        value={mapped ?? '__skip'}
                        onChange={e => onPlayerChange(i, e.target.value)}
                        style={{
                          width: '100%', padding: '4px 24px 4px 8px',
                          backgroundColor: isSkip ? '#1E2229' : 'rgba(0,229,160,0.08)',
                          border: `1px solid ${isSkip ? '#2A2F3A' : '#00E5A040'}`,
                          borderRadius: 5, color: isSkip ? '#475569' : '#00E5A0',
                          fontSize: '0.75rem', outline: 'none', cursor: 'pointer',
                          appearance: 'none',
                        }}
                      >
                        <option value="__skip">— Hors effectif</option>
                        {players
                          .slice()
                          .sort((a, b) => a.number - b.number)
                          .map(p => (
                            <option key={p.id} value={p.id}>
                              #{p.number} {p.lastName} {p.firstName[0]}.
                            </option>
                          ))}
                      </select>
                      <ChevronDown size={11} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', color: '#475569', pointerEvents: 'none' }} />
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ModeToggle({ value, onChange }: {
  value: 'individual' | 'collective';
  onChange: (v: 'individual' | 'collective') => void;
}) {
  return (
    <div style={{ display: 'flex', backgroundColor: '#0D0F14', borderRadius: 6, padding: 2, gap: 2 }}>
      {(['individual', 'collective'] as const).map(m => (
        <button key={m} type="button" onClick={() => onChange(m)}
          style={{
            padding: '4px 14px', borderRadius: 4, border: 'none', cursor: 'pointer',
            fontSize: '0.75rem', fontWeight: value === m ? 700 : 400,
            backgroundColor: value === m ? '#1E2229' : 'transparent',
            color: value === m ? '#00E5A0' : '#475569',
          }}>
          {m === 'individual' ? 'Individuel' : 'Collectif'}
        </button>
      ))}
    </div>
  );
}

function CollectiveForm({ values, onChange }: {
  values: CollectiveStatInput;
  onChange: (key: keyof CollectiveStatInput, val: number) => void;
}) {
  const inp = (key: keyof CollectiveStatInput, step = 1) => (
    <input
      type="number" min={0} step={step}
      value={(values[key] as number) === 0 ? '' : values[key]}
      onChange={e => onChange(key, step < 1 ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0)}
      style={{
        width: 60, padding: '5px 0', backgroundColor: '#1E2229',
        border: '1px solid #2A2F3A', borderRadius: 5, color: '#F1F5F9',
        fontSize: '0.82rem', textAlign: 'center', outline: 'none', boxSizing: 'border-box' as const,
      }}
    />
  );
  const sep = <span style={{ color: '#475569', fontSize: '0.8rem', userSelect: 'none' }}>/</span>;

  const row = (label: string, ...nodes: React.ReactNode[]) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 32 }}>
      <span style={{ flex: 1, color: '#94A3B8', fontSize: '0.78rem' }}>{label}</span>
      {nodes}
    </div>
  );

  const secHd = (t: string) => (
    <div style={{
      color: '#475569', fontSize: '0.64rem', fontWeight: 700,
      textTransform: 'uppercase' as const, letterSpacing: '0.08em',
      paddingTop: 10, paddingBottom: 4,
      borderBottom: '1px solid rgba(42,47,58,0.5)', marginBottom: 2,
    }}>{t}</div>
  );

  const calcPoss = () => {
    const p = Math.round(((values.fg2a + values.fg3a) - values.ro + values.bp + 0.44 * values.fta) * 10) / 10;
    return p > 0 ? p : '—';
  };
  const readonlyVal = (label: string, val: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 32 }}>
      <span style={{ flex: 1, color: '#475569', fontSize: '0.78rem' }}>{label}</span>
      <span style={{ width: 60, textAlign: 'center', color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem' }}>{val}</span>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
      {/* Colonne gauche : Tirs + Rebonds */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {secHd('Tirs')}
        {row('2pts (R / T)', inp('fg2m'), sep, inp('fg2a'))}
        {row('3pts (R / T)', inp('fg3m'), sep, inp('fg3a'))}
        {row('Lancers-francs (R / T)', inp('ftm'), sep, inp('fta'))}
        {secHd('Rebonds')}
        {row('Offensifs (RO)', inp('ro'))}
        {row('Défensifs (RD)', inp('rd'))}
        {readonlyVal('Totaux (RT)', values.ro + values.rd || '—')}
      </div>

      {/* Colonne droite : Jeu */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {secHd('Jeu')}
        {row('Passes décisives', inp('pd'))}
        {row('Contres', inp('ct'))}
        {row('Interceptions', inp('intercepts'))}
        {row('Balles perdues', inp('bp'))}
        {row('Fautes reçues', inp('fte'))}
        {row('Fautes commises', inp('fpr'))}
        {readonlyVal('Possessions ≈', calcPoss())}
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface Props {
  match: Match;
  players: Player[];
  hasExistingStats: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function MatchStatsImportModal({ match, players, hasExistingStats, onClose, onSaved }: Props) {
  const [ownMode, setOwnMode] = useState<'individual' | 'collective'>('individual');
  const [oppMode, setOppMode] = useState<'individual' | 'collective'>('individual');
  const [ownRows, setOwnRows] = useState<CsvRow[]>([]);
  const [oppRows, setOppRows] = useState<CsvRow[]>([]);
  const [ownDetected, setOwnDetected] = useState<ParseResult['detected']>([]);
  const [oppDetected, setOppDetected] = useState<ParseResult['detected']>([]);
  const [playerMap, setPlayerMap] = useState<Record<number, string>>({});
  const [manualOwn, setManualOwn] = useState<CollectiveStatInput>(emptyCollective());
  const [manualOpp, setManualOpp] = useState<CollectiveStatInput>(emptyCollective());
  const [saving, setSaving]       = useState(false);
  const [error,  setError]        = useState('');
  const [ownErr, setOwnErr]       = useState('');
  const [oppErr, setOppErr]       = useState('');

  useEffect(() => {
    statsApi.getTeamStatsByMatchId(match.id).then(ts => {
      if (!ts) return;
      const hasOwn = ts.fg2a > 0 || ts.fg3a > 0 || ts.fta > 0 || ts.pd > 0 || ts.ro > 0 || ts.rd > 0 || ts.bp > 0;
      const hasOpp = ts.opp_fg2a > 0 || ts.opp_fg3a > 0 || ts.opp_fta > 0 || ts.opp_pd > 0 || ts.opp_ro > 0 || ts.opp_rd > 0 || ts.opp_bp > 0;
      if (hasOwn) { setManualOwn(teamStatToCollective(ts, 'own')); setOwnMode('collective'); }
      if (hasOpp) { setManualOpp(teamStatToCollective(ts, 'opp')); setOppMode('collective'); }
    }).catch(() => {});
  }, [match.id]);

  function loadFile(file: File, side: 'own' | 'opp') {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const result = parseCsv(e.target?.result as string);
        if (result.rows.length === 0) {
          const msg = 'Aucune ligne détectée — vérifiez le format (tabulation ou point-virgule).';
          side === 'own' ? setOwnErr(msg) : setOppErr(msg);
          return;
        }
        if (side === 'own') {
          setOwnErr('');
          setOwnRows(result.rows);
          setOwnDetected(result.detected);
          const map: Record<number, string> = {};
          result.rows.forEach((r, i) => { map[i] = tryAutoMatch(r.nom, players) ?? '__skip'; });
          setPlayerMap(map);
        } else {
          setOppErr('');
          setOppRows(result.rows);
          setOppDetected(result.detected);
        }
      } catch {
        const msg = 'Erreur de lecture — vérifiez l\'encodage du fichier (UTF-8).';
        side === 'own' ? setOwnErr(msg) : setOppErr(msg);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  const finalOwn: CollectiveStatInput | null =
    ownMode === 'individual'
      ? (ownRows.length > 0 ? calcCollective(ownRows) : null)
      : (Object.values(manualOwn).some(v => v !== 0) ? manualOwn : null);

  const finalOpp: CollectiveStatInput | null =
    oppMode === 'individual'
      ? (oppRows.length > 0 ? calcCollective(oppRows) : null)
      : (Object.values(manualOpp).some(v => v !== 0) ? manualOpp : null);

  const calcPts = (c: CollectiveStatInput) => c.fg2m * 2 + c.fg3m * 3 + c.ftm;
  const ownPts = finalOwn ? calcPts(finalOwn) : 0;
  const oppPts = finalOpp ? calcPts(finalOpp) : 0;

  async function handleSave() {
    setError('');
    const hasIndividual = ownMode === 'individual' && ownRows.length > 0;
    const hasAnyData = finalOwn || finalOpp || hasIndividual;
    if (!hasAnyData) {
      setError('Ajoutez des statistiques pour au moins une équipe.');
      return;
    }
    if (!hasExistingStats && !finalOwn && !hasIndividual) {
      setError('Les statistiques de votre équipe sont requises pour le premier import.');
      return;
    }

    setSaving(true);
    try {
      // Statistiques individuelles
      if (hasIndividual) {
        const bulk: BulkStatRow[] = ownRows
          .map((r, i) => ({ r, pid: playerMap[i] }))
          .filter(({ pid }) => pid && pid !== '__skip')
          .map(({ r, pid }) => ({
            playerId:   pid,
            starter:    false,
            min:        r.min,
            fg2m: r.fg2m, fg2a: r.fg2a,
            fg3m: r.fg3m, fg3a: r.fg3a,
            ftm:  r.ftm,  fta:  r.fta,
            ro: r.ro, rd: r.rd,
            pd: r.pd, ct: r.ct,
            intercepts: r.intercepts, bp: r.bp,
            fte: r.fte, fpr: r.fpr,
            eval:      r.eval,
            plusMinus: r.plusMinus,
          }));
        if (bulk.length > 0) await statsApi.bulkUpsertForMatch(match.id, bulk, match);
      }

      // Statistiques individuelles adverses
      if (oppMode === 'individual' && oppRows.length > 0) {
        const oppIndividual: OpponentStatInput[] = oppRows.map(r => ({
          playerName: r.nom,
          min: r.min,
          fg2m: r.fg2m, fg2a: r.fg2a,
          fg3m: r.fg3m, fg3a: r.fg3a,
          ftm:  r.ftm,  fta:  r.fta,
          ro: r.ro, rd: r.rd,
          pd: r.pd, ct: r.ct,
          intercepts: r.intercepts, bp: r.bp,
          fte: r.fte, fpr: r.fpr,
          eval:      r.eval,
          plusMinus: r.plusMinus,
        }));
        await statsApi.bulkUpsertOpponentStatsForMatch(match.id, oppIndividual);
      }

      // Statistiques collectives (possessions recalculées depuis les champs)
      const withPoss = (c: CollectiveStatInput): CollectiveStatInput => ({
        ...c,
        possessions: Math.round(((c.fg2a + c.fg3a) - c.ro + c.bp + 0.44 * c.fta) * 10) / 10,
      });
      if (finalOwn || finalOpp) {
        await statsApi.upsertTeamStats(
          match.id,
          finalOwn ? withPoss(finalOwn) : undefined,
          finalOpp ? withPoss(finalOpp) : undefined,
        );
      }

      // Mise à jour automatique du score
      const newScoreUs   = finalOwn && calcPts(finalOwn)   > 0 ? calcPts(finalOwn)   : null;
      const newScoreThem = finalOpp && calcPts(finalOpp) > 0 ? calcPts(finalOpp) : null;
      const updScoreUs   = newScoreUs   !== null ? newScoreUs   : match.scoreUs;
      const updScoreThem = newScoreThem !== null ? newScoreThem : match.scoreThem;
      const updResult: 'win' | 'loss' = updScoreUs > updScoreThem ? 'win' : 'loss';
      const scoreChanged =
        (newScoreUs   !== null && newScoreUs   !== match.scoreUs)   ||
        (newScoreThem !== null && newScoreThem !== match.scoreThem) ||
        updResult !== match.result;
      if (scoreChanged) {
        await matchesApi.update(match.id, { scoreUs: updScoreUs, scoreThem: updScoreThem, result: updResult });
      }

      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement.');
    } finally {
      setSaving(false);
    }
  }

  const matchedCount = Object.values(playerMap).filter(v => v && v !== '__skip').length;

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#1A1D24', border: '1px solid #2A2F3A', borderRadius: 8,
  };
  const cardHeaderStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid #2A2F3A',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 12px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 960, flexShrink: 0 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #2A2F3A' }}>
          <div>
            <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Importer les statistiques</h2>
            <p style={{ color: '#475569', margin: '2px 0 0', fontSize: '0.78rem' }}>vs {match.opponent} · {match.date}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Banner re-import */}
        {hasExistingStats && (
          <div style={{ padding: '8px 24px', backgroundColor: 'rgba(59,130,246,0.08)', borderBottom: '1px solid rgba(59,130,246,0.15)', fontSize: '0.75rem', color: '#60A5FA' }}>
            Des statistiques existent déjà pour ce match — elles seront mises à jour.
          </div>
        )}

        {/* Score preview */}
        {(ownPts > 0 || oppPts > 0) && (
          <div style={{
            padding: '8px 24px', borderBottom: '1px solid #2A2F3A',
            backgroundColor: ownPts > oppPts ? 'rgba(0,229,160,0.07)' : ownPts < oppPts ? 'rgba(239,68,68,0.07)' : '#1A1D24',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ color: '#475569', fontSize: '0.72rem' }}>Score calculé :</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '1rem', color: ownPts > oppPts ? '#00E5A0' : ownPts < oppPts ? '#EF4444' : '#F1F5F9' }}>
              {ownPts} – {oppPts}
            </span>
            {ownPts !== oppPts && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: ownPts > oppPts ? '#00E5A0' : '#EF4444' }}>
                {ownPts > oppPts ? 'VICTOIRE' : 'DÉFAITE'}
              </span>
            )}
          </div>
        )}

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Mon équipe */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.9rem' }}>Mon équipe</span>
              <ModeToggle value={ownMode} onChange={setOwnMode} />
            </div>
            <div style={{ padding: '16px' }}>
              {ownMode === 'individual' ? (
                <div>
                  <UploadZone onFile={f => loadFile(f, 'own')} error={ownErr} />
                  {ownRows.length > 0 && (
                    <div>
                      <p style={{ color: '#475569', fontSize: '0.72rem', margin: '10px 0 0' }}>
                        {ownRows.length} ligne{ownRows.length > 1 ? 's' : ''} · {matchedCount} joueur{matchedCount !== 1 ? 's' : ''} attribué{matchedCount !== 1 ? 's' : ''}
                      </p>
                      <ColDetectionBadges detected={ownDetected} />
                      <CsvTable
                        rows={ownRows} showMatch players={players}
                        playerMap={playerMap}
                        onPlayerChange={(i, pid) => setPlayerMap(m => ({ ...m, [i]: pid }))}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <CollectiveForm
                  values={manualOwn}
                  onChange={(key, val) => setManualOwn(s => ({ ...s, [key]: val }))}
                />
              )}
            </div>
          </div>

          {/* Adversaire */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.9rem' }}>{match.opponent}</span>
                <span style={{ color: '#475569', fontSize: '0.72rem' }}>· optionnel</span>
              </div>
              <ModeToggle value={oppMode} onChange={setOppMode} />
            </div>
            <div style={{ padding: '16px' }}>
              {oppMode === 'individual' ? (
                <div>
                  <UploadZone onFile={f => loadFile(f, 'opp')} error={oppErr} />
                  {oppRows.length > 0 && (
                    <div>
                      <p style={{ color: '#475569', fontSize: '0.72rem', margin: '10px 0 0' }}>
                        {oppRows.length} ligne{oppRows.length > 1 ? 's' : ''} · Stats collectives calculées automatiquement
                      </p>
                      <ColDetectionBadges detected={oppDetected} />
                      <CsvTable rows={oppRows} showMatch={false} players={[]} playerMap={{}} onPlayerChange={() => {}} />
                    </div>
                  )}
                </div>
              ) : (
                <CollectiveForm
                  values={manualOpp}
                  onChange={(key, val) => setManualOpp(s => ({ ...s, [key]: val }))}
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #2A2F3A', display: 'flex', alignItems: 'center', gap: 12 }}>
          {error && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, color: '#EF4444', fontSize: '0.8rem' }}>
              <AlertCircle size={13} /> {error}
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose}
              style={{ padding: '9px 18px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.85rem' }}>
              Annuler
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              style={{ padding: '9px 22px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
              {saving ? 'Enregistrement…' : 'Importer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
