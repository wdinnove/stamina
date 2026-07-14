import { useState } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend } from 'recharts';
import { Heart, TrendingUp, Smile, Meh, Frown } from 'lucide-react';
import { Card, CardTitle } from '../components';
import { WELLNESS_DIMENSIONS, wellnessScoreColor, wellnessDimColor, wellnessAvg, wellnessStatus, wellnessRawValue } from '../utils/wellness';
import type { WellnessEntry } from '../data/types';

const dimensions = WELLNESS_DIMENSIONS;
const scoreColor = wellnessScoreColor;
const dimColor   = wellnessDimColor;

// Dimensions fixes du radar POMS (hauteur/marge partagées entre le conteneur et le RadarChart)
const RADAR_HEIGHT = 340;
const RADAR_MARGIN = 10;

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px', fontSize: '0.78rem' }}>
      <p style={{ color: '#94A3B8', margin: '0 0 4px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

interface WellnessPomsPanelProps {
  /** Saisies (joueur ou agrégat équipe) déjà filtrées sur la période sélectionnée. */
  entries: WellnessEntry[];
  /** Saisies filtrées sur la saison, utilisées pour les écarts "vs saison". */
  seasonEntries: WellnessEntry[];
  /** false quand le preset de période est déjà "Saison" (l'écart serait toujours ~0). */
  showSeasonDiff: boolean;
  /** "L'équipe" ou le prénom du joueur, injecté dans la phrase d'insight. */
  subjectLabel: string;
}

export function WellnessPomsPanel({ entries, seasonEntries, showSeasonDiff, subjectLabel }: WellnessPomsPanelProps) {
  // Courbes par dimension du graphique "Évolution › Global" : masquées par défaut, affichées au clic sur la légende
  const [evoTab, setEvoTab] = useState<'global' | 'detail' | 'history'>('global');
  const [hiddenDimCurves, setHiddenDimCurves] = useState<Set<string>>(() => new Set(dimensions.map(d => d.key)));

  const historyAsc = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  // Une mini-série par dimension : valeurs brutes sur la courbe, axe inversé pour les dimensions
  // "inversées" (fatigue/stress/douleurs) pour que le haut du graphique reste toujours "mieux".
  const dimensionSeries = dimensions.map(dim => {
    const rawValues = historyAsc.map(e => e[dim.key as keyof WellnessEntry] as number);
    const avg = rawValues.length > 0 ? Math.round(rawValues.reduce((s, v) => s + v, 0) / rawValues.length * 10) / 10 : null;
    return {
      ...dim,
      avg,
      series: historyAsc.map((e, i) => ({ idx: i, date: fmtDate(e.date), value: e[dim.key as keyof WellnessEntry] as number })),
    };
  });

  // Score global de la période : une seule moyenne, réutilisée pour le radar POMS et le KPI "Score global"
  const scoreAvg    = wellnessAvg(entries.map(e => e.score));
  const radarColor  = scoreColor(scoreAvg ?? 5);

  // ── Comparaison vs moyenne saison, réutilisée par le radar POMS et les KPI de période ──
  const seasonScoreAvg = wellnessAvg(seasonEntries.map(e => e.score));
  const dimSeasonAvg = (key: string) =>
    showSeasonDiff ? wellnessAvg(seasonEntries.map(e => e[key as keyof WellnessEntry] as number)) : null;

  const radarData = dimensionSeries.map(dim => {
    const prev = dimSeasonAvg(dim.key);
    const diff = dim.avg !== null && prev !== null ? Math.round((dim.avg - prev) * 10) / 10 : null;
    return { dim: dim.shortLabel, value: dim.avg ?? 0, avg: dim.avg, inverted: dim.inverted, diff, fullMark: 10 };
  });

  // Série du score global + les 6 dimensions (remises "plus haut = mieux" via wellnessRawValue, même sens que le score)
  const scoreSeries = historyAsc.map((e, i) => ({
    idx: i, date: fmtDate(e.date), value: e.score,
    ...Object.fromEntries(dimensions.map(d => [d.key, wellnessRawValue(e[d.key as keyof WellnessEntry] as number, d.inverted)])),
  }));

  const tableData = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  // ── Résumé en langage naturel de la période, affiché sous le sélecteur de dates ──
  const goodDims = dimensionSeries.filter(d => d.avg !== null && wellnessStatus(d.avg, d.inverted) === 'good').map(d => d.shortLabel);
  const midDims  = dimensionSeries.filter(d => d.avg !== null && wellnessStatus(d.avg, d.inverted) === 'mid').map(d => d.shortLabel);
  const badDims  = dimensionSeries.filter(d => d.avg !== null && wellnessStatus(d.avg, d.inverted) === 'bad').map(d => d.shortLabel);
  const insightStatus: 'good' | 'mid' | 'bad' | null = scoreAvg === null ? null : wellnessStatus(scoreAvg, false);
  const insightColor  = insightStatus === null ? '#475569' : scoreColor(scoreAvg ?? 5);
  const insightLabel  = insightStatus === 'good' ? 'plutôt bonne' : insightStatus === 'mid' ? 'moyenne' : 'compliquée';
  const InsightIcon   = insightStatus === 'good' ? Smile : insightStatus === 'mid' ? Meh : Frown;
  const insightSeasonDiff = showSeasonDiff && scoreAvg !== null && seasonScoreAvg !== null
    ? Math.round((scoreAvg - seasonScoreAvg) * 10) / 10 : null;
  const insightSeasonPhrase = insightSeasonDiff === null ? null
    : Math.abs(insightSeasonDiff) < 0.2 ? 'stable par rapport à la saison'
    : insightSeasonDiff > 0 ? `en progression par rapport à la saison (+${insightSeasonDiff})`
    : `en baisse par rapport à la saison (${insightSeasonDiff})`;

  return (
    <>
      {/* Résumé en langage naturel de la période */}
      {insightStatus !== null && (
        <div style={{
          backgroundColor: `${insightColor}10`, border: `1px solid ${insightColor}40`, borderLeft: `4px solid ${insightColor}`,
          borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
        }}>
          <InsightIcon size={22} style={{ color: insightColor, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ color: '#F1F5F9', margin: 0, fontSize: '0.86rem', fontWeight: 600 }}>
              {subjectLabel} traverse une période {insightLabel} ({scoreAvg}/10){insightSeasonPhrase ? `, ${insightSeasonPhrase}` : ''}
            </p>
            {(goodDims.length > 0 || midDims.length > 0 || badDims.length > 0) && (
              <p style={{ color: '#94A3B8', margin: '4px 0 0', fontSize: '0.8rem' }}>
                {goodDims.length > 0 && (
                  <><span style={{ color: '#00E5A0', fontWeight: 600 }}>Points forts</span> : {goodDims.join(', ')}. </>
                )}
                {midDims.length > 0 && (
                  <><span style={{ color: '#F59E0B', fontWeight: 600 }}>Points d'attention</span> : {midDims.join(', ')}. </>
                )}
                {badDims.length > 0 && (
                  <><span style={{ color: '#EF4444', fontWeight: 600 }}>Points négatifs</span> : {badDims.join(', ')}.</>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Ligne 2 : POMS | Évolution */}
        <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 16 }}>
          <Card className="md:col-span-1" style={{ display: 'flex', flexDirection: 'column', alignSelf: 'start' }}>
            <CardTitle icon={<Heart size={12} style={{ color: '#F472B6' }} />} mb={14}
              right={<span style={{ color: '#475569', fontSize: '0.7rem' }}>{historyAsc.length} saisie{historyAsc.length > 1 ? 's' : ''}</span>}
            >Profil POMS</CardTitle>
            <div style={{ position: 'relative', height: RADAR_HEIGHT }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="78%" margin={{ top: RADAR_MARGIN, right: RADAR_MARGIN, bottom: RADAR_MARGIN, left: RADAR_MARGIN }}>
                  <PolarGrid stroke="#2A2F3A" />
                  <PolarAngleAxis dataKey="dim" tick={{ fill: '#94A3B8', fontSize: 10 }} tickSize={16} />
                  <Radar name="Moy." dataKey="value" stroke={radarColor} fill={radarColor} fillOpacity={0.1} strokeWidth={2}
                    dot={(props: { cx: number; cy: number; index: number }) => {
                      const dataPoint = radarData[props.index];
                      if (!dataPoint) return <g key={props.index} />;
                      const hasValue = dataPoint.avg !== null;
                      const color    = hasValue ? dimColor(dataPoint.value, dataPoint.inverted) : '#475569';
                      const diff     = dataPoint.diff;
                      const hasEvo   = diff !== null;
                      const flat     = hasEvo && Math.abs(diff!) < 0.05;
                      const better   = hasEvo ? (dataPoint.inverted ? diff! < 0 : diff! > 0) : null;
                      const evoColor = flat ? '#94A3B8' : better ? '#00E5A0' : '#EF4444';
                      const valueStr = hasValue ? String(dataPoint.avg) : '—';

                      // Flèche/tiret d'évolution dessiné en forme SVG (pas en caractère Unicode ▲▼) pour éviter
                      // tout décalage de police de secours qui la ferait chevaucher le dernier chiffre.
                      const CHAR_W   = 6.2;
                      const ICON_W   = 8;
                      const GAP      = 4;
                      const PAD_X    = 7;
                      const valueW   = valueStr.length * CHAR_W;
                      const contentW = valueW + (hasEvo ? GAP + ICON_W : 0);
                      const w = contentW + PAD_X * 2;
                      const h = 16;
                      const groupLeft = props.cx - contentW / 2;
                      const iconCx    = groupLeft + valueW + GAP + ICON_W / 2;

                      return (
                        <g key={props.index}>
                          <rect x={props.cx - w / 2} y={props.cy - h / 2} width={w} height={h} rx={4}
                            fill="#161920" stroke={color} strokeWidth={1.5} />
                          <text x={groupLeft} y={props.cy + 1} textAnchor="start" dominantBaseline="central" fill={color}
                            style={{ fontSize: 10, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', pointerEvents: 'none' }}>
                            {valueStr}
                          </text>
                          {hasEvo && (flat
                            ? <rect x={iconCx - 3.5} y={props.cy - 1} width={7} height={2} rx={1} fill={evoColor} />
                            : <polygon fill={evoColor} points={better
                                ? `${iconCx - 3.5},${props.cy + 2.5} ${iconCx + 3.5},${props.cy + 2.5} ${iconCx},${props.cy - 3}`
                                : `${iconCx - 3.5},${props.cy - 2.5} ${iconCx + 3.5},${props.cy - 2.5} ${iconCx},${props.cy + 3}`}
                              />
                          )}
                        </g>
                      );
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                <div style={{ color: radarColor, fontSize: '1.1rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{scoreAvg ?? '—'}</div>
              </div>
            </div>
          </Card>

          <Card className="md:col-span-2" style={{ display: 'flex', flexDirection: 'column' }}>
            <CardTitle icon={<TrendingUp size={12} style={{ color: '#00E5A0' }} />} mb={14} align="flex-start"
              right={
                <div style={{ display: 'flex', gap: 2, backgroundColor: '#0D0F14', borderRadius: 6, padding: 2 }}>
                  {([['global', 'Global'], ['detail', 'Par type'], ['history', 'Historique']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setEvoTab(key)}
                      style={{ padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: evoTab === key ? 700 : 400, backgroundColor: evoTab === key ? '#1E2229' : 'transparent', color: evoTab === key ? '#00E5A0' : '#475569', whiteSpace: 'nowrap' }}>
                      {label}
                    </button>
                  ))}
                </div>
              }
            >Évolution</CardTitle>

            {evoTab === 'global' && (
              <div style={{ height: RADAR_HEIGHT - 40 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={scoreSeries} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      {/* y1/y2 en % (pas en px) : le dégradé suit toujours la hauteur réelle du graphique,
                          quelle que soit la taille de la card, et reste calé sur l'échelle 0–10 affichée */}
                      <linearGradient id="grad-score" gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%"   stopColor="#00E5A0" />
                        <stop offset="30%"  stopColor="#00E5A0" />
                        <stop offset="50%"  stopColor="#F59E0B" />
                        <stop offset="70%"  stopColor="#EF4444" />
                        <stop offset="100%" stopColor="#EF4444" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
                    <XAxis dataKey="idx" tickFormatter={idx => scoreSeries[idx]?.date ?? ''}
                      interval={Math.max(0, Math.ceil(scoreSeries.length / 10) - 1)}
                      tick={{ fill: '#475569', fontSize: 10 }} />
                    <YAxis domain={[0, 10]} ticks={[3, 6, 10]} width={28} tick={{ fill: '#475569', fontSize: 10 }} />
                    {/* Seuils de coloration (wellnessScoreColor) : ≥7 bon, ≥5 moyen, sinon mauvais */}
                    <ReferenceLine y={7} stroke="#00E5A0" strokeOpacity={0.4} strokeDasharray="4 4" />
                    <ReferenceLine y={5} stroke="#F59E0B" strokeOpacity={0.4} strokeDasharray="4 4" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: '0.68rem' }}
                      inactiveColor="#334155"
                      payload={[
                        { value: 'Score', dataKey: 'value', color: radarColor, type: 'line' },
                        ...dimensions.map(dim => ({ value: dim.shortLabel, dataKey: dim.key, color: dim.color, type: 'line' as const, inactive: hiddenDimCurves.has(dim.key) })),
                      ]}
                      onClick={(entry: any) => {
                        const key = entry?.dataKey;
                        if (typeof key !== 'string' || key === 'value') return;
                        setHiddenDimCurves(prev => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key); else next.add(key);
                          return next;
                        });
                      }}
                      formatter={(value: string, entry: any) => (
                        <span style={{ color: entry?.inactive ? '#334155' : '#94A3B8', cursor: entry?.dataKey === 'value' ? 'default' : 'pointer' }}>{value}</span>
                      )}
                    />
                    {dimensions.map(dim => (
                      <Line key={dim.key} dataKey={dim.key} name={dim.shortLabel} stroke={dim.color} strokeWidth={1.25}
                        strokeDasharray="4 3" hide={hiddenDimCurves.has(dim.key)} dot={false} isAnimationActive={false} />
                    ))}
                    <Line dataKey="value" name="Score" stroke="url(#grad-score)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {evoTab === 'detail' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 10 }}>
                  {dimensionSeries.map(dim => {
                    const boxColor = dim.avg !== null ? dimColor(dim.avg, dim.inverted) : '#1E2229';
                    const prev   = dimSeasonAvg(dim.key);
                    const diff   = dim.avg !== null && prev !== null ? Math.round((dim.avg - prev) * 10) / 10 : null;
                    const flat   = diff !== null && Math.abs(diff) < 0.05;
                    const better = diff !== null ? (dim.inverted ? diff < 0 : diff > 0) : null;
                    const evoColor = flat ? '#94A3B8' : better ? '#00E5A0' : '#EF4444';
                    return (
                    <div key={dim.key} style={{ backgroundColor: '#0D0F14', border: `1px solid ${boxColor}50`, borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ color: '#94A3B8', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dim.emoji} {dim.shortLabel}</span>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
                          backgroundColor: '#161920', border: `1px solid ${boxColor}`, borderRadius: 4,
                          padding: '1px 6px', fontSize: '0.7rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
                          color: boxColor,
                        }}>
                          {dim.avg ?? '—'}
                          {diff !== null && (
                            <span style={{ color: evoColor, fontSize: '0.6rem' }}>{flat ? '=' : better ? '▲' : '▼'}</span>
                          )}
                        </span>
                      </div>
                      <div className="h-[70px] sm:h-[100px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={dim.series}>
                            <defs>
                              {/* y1/y2 en % : même principe que le graphique Global, le dégradé suit la hauteur réelle */}
                              <linearGradient id={`grad-${dim.key}`} gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%"   stopColor="#00E5A0" />
                                <stop offset="30%"  stopColor="#00E5A0" />
                                <stop offset="50%"  stopColor="#F59E0B" />
                                <stop offset="70%"  stopColor="#EF4444" />
                                <stop offset="100%" stopColor="#EF4444" />
                              </linearGradient>
                            </defs>
                            <YAxis domain={[0, 10]} reversed={dim.inverted} hide />
                            {/* Seuils de coloration, mêmes seuils que partout ailleurs (≥7 bon / ≥5 moyen en sens "ressenti"),
                                ramenés à l'échelle brute stockée pour les dimensions inversées (fatigue/stress/douleurs) */}
                            <ReferenceLine y={dim.inverted ? 4 : 7} stroke="#00E5A0" strokeOpacity={0.4} strokeDasharray="4 4" />
                            <ReferenceLine y={dim.inverted ? 6 : 5} stroke="#F59E0B" strokeOpacity={0.4} strokeDasharray="4 4" />
                            <Tooltip content={<CustomTooltip />} />
                            <Line
                              dataKey="value" name={dim.label} stroke={`url(#grad-${dim.key})`} strokeWidth={2.5}
                              dot={false} isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </>
            )}

            {evoTab === 'history' && (
              <div style={{ overflowX: 'auto', minHeight: RADAR_HEIGHT, border: '1px solid #2A2F3A', borderRadius: 8 }}>
                <div style={{ padding: '8px 14px', borderBottom: '1px solid #2A2F3A', display: 'grid', gridTemplateColumns: '90px repeat(6, 1fr) 56px', gap: 4, minWidth: 500 }}>
                  {['Date', ...dimensions.map(d => d.shortLabel), 'Score'].map(h => (
                    <span key={h} style={{ color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: h === 'Score' ? 'right' : 'left' }}>{h}</span>
                  ))}
                </div>
                {tableData.map((e, idx) => (
                  <div key={idx} style={{ padding: '6px 14px', borderBottom: '1px solid #1A1E26', display: 'grid', gridTemplateColumns: '90px repeat(6, 1fr) 56px', gap: 4, alignItems: 'center', minWidth: 500 }}>
                    <span style={{ color: '#64748B', fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace' }}>{fmtDate(e.date)}</span>
                    {dimensions.map((dim, i) => {
                      const val = [e.fatigue, e.mood, e.stress, e.motivation, e.sleep, e.soreness][i];
                      return (
                        <span key={i} style={{ color: dimColor(val, dim.inverted), fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{val}</span>
                      );
                    })}
                    <span style={{ color: scoreColor(e.score), fontWeight: 700, fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>{e.score}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

      </div>
    </>
  );
}
