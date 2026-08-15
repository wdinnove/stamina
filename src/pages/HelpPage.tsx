import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { BookOpen, Sigma, HelpCircle, Users } from 'lucide-react';
import { Card, CardTitle, Badge } from '../components';
import { ResponsiveTabNav, type TabNavGroup } from '../components/ResponsiveTabNav';
import {
  DOMAIN_LABELS, playerAttributeIndicators, teamIndicators, type IndicatorDef,
} from '../data/crossAnalysis';
import { PROFILES_V1, DIMENSIONS_V1, CATEGORY_LABELS } from '../data/archetypes';
import { FAQ_ENTRIES } from '../data/faq';

const SECTIONS = [
  { key: 'glossaire',   label: 'Glossaire',   icon: BookOpen },
  { key: 'formules',    label: 'Formules',    icon: Sigma },
  { key: 'faq',         label: 'FAQ',         icon: HelpCircle },
  { key: 'archetypes',  label: 'Archétypes',  icon: Users },
] as const;

type Section = typeof SECTIONS[number]['key'];
const isSection = (v: string | undefined): v is Section => SECTIONS.some(s => s.key === v);

const SENSE_LABEL = {
  higher:  { text: 'Plus haut = mieux', color: '#00E5A0' },
  lower:   { text: 'Plus bas = mieux',  color: '#F59E0B' },
  context: { text: 'Contexte',          color: '#64748B' },
} as const;

/** Tous les indicateurs documentés, dédoublonnés (un même indicateur sert joueur et équipe). */
function allIndicators(): IndicatorDef[] {
  const byKey = new Map<string, IndicatorDef>();
  for (const def of [...playerAttributeIndicators(), ...teamIndicators()]) {
    if (!byKey.has(def.key)) byKey.set(def.key, def);
  }
  return [...byKey.values()];
}

function groupIndicators(defs: IndicatorDef[]): { group: string; defs: IndicatorDef[] }[] {
  const order: string[] = [];
  const byGroup = new Map<string, IndicatorDef[]>();
  for (const def of defs) {
    const g = def.group ?? DOMAIN_LABELS[def.domain];
    if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g); }
    byGroup.get(g)!.push(def);
  }
  return order.map(group => ({ group, defs: byGroup.get(group)! }));
}

/* ── Glossaire ───────────────────────────────────────────────────────────── */

function GlossarySection() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
        Tous les chiffres affichés dans l'app, ce qu'ils signifient et dans quel sens les lire.
        La même explication apparaît au survol de l'icône <span style={{ color: '#94A3B8' }}>ⓘ</span> à
        côté de chaque colonne : il n'y a qu'une seule source, pas deux textes à maintenir.
      </p>
      {groupIndicators(allIndicators()).map(({ group, defs }) => (
        <Card key={group}>
          <CardTitle mb={10}>{group}</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {defs.map(def => (
              <div key={def.key} style={{
                display: 'flex', gap: 12, padding: '9px 0',
                borderBottom: '1px solid #1A1F27', alignItems: 'flex-start',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: def.color, flexShrink: 0, marginTop: 6 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600 }}>{def.label}</span>
                    <span style={{ color: '#475569', fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace' }}>
                      {def.shortLabel}{def.unit ? ` · ${def.unit}` : ''}
                    </span>
                    {def.sense && (
                      <Badge color={SENSE_LABEL[def.sense].color} label={SENSE_LABEL[def.sense].text} size="sm" />
                    )}
                  </div>
                  <p style={{ color: '#94A3B8', fontSize: '0.8rem', lineHeight: 1.55, margin: '3px 0 0' }}>
                    {def.explain}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ── Formules ────────────────────────────────────────────────────────────── */

function FormulasSection() {
  const withFormula = groupIndicators(allIndicators().filter(d => d.formula));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
        Seuls les indicateurs dont la formule éclaire la lecture figurent ici — un total de rebonds
        n'a pas besoin d'être expliqué. Le détail complet des calculs, y compris ceux qui ne sont pas
        des indicateurs (charge, ACWR, archétypes), vit dans <code style={{ color: '#94A3B8' }}>docs/CALCULS.md</code>.
      </p>
      {withFormula.map(({ group, defs }) => (
        <Card key={group}>
          <CardTitle mb={10}>{group}</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {defs.map(def => (
              <div key={def.key}>
                <div style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
                  {def.label}
                </div>
                <div style={{
                  padding: '7px 10px', borderRadius: 5, backgroundColor: '#0F1117',
                  border: '1px solid #1E2229', color: '#94A3B8',
                  fontSize: '0.76rem', fontFamily: 'JetBrains Mono, monospace',
                  overflowX: 'auto', whiteSpace: 'pre-wrap',
                }}>
                  {def.formula}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ── FAQ ─────────────────────────────────────────────────────────────────── */

function FaqSection() {
  const groups: string[] = [];
  const byTheme = new Map<string, typeof FAQ_ENTRIES>();
  for (const entry of FAQ_ENTRIES) {
    if (!byTheme.has(entry.theme)) { byTheme.set(entry.theme, []); groups.push(entry.theme); }
    byTheme.get(entry.theme)!.push(entry);
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map(theme => (
        <Card key={theme}>
          <CardTitle mb={10}>{theme}</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {byTheme.get(theme)!.map(entry => (
              <div key={entry.question}>
                <p style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600, margin: '0 0 4px' }}>
                  {entry.question}
                </p>
                <p style={{ color: '#94A3B8', fontSize: '0.8rem', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-line' }}>
                  {entry.answer}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ── Méthodo archétypes ──────────────────────────────────────────────────── */

const STATUS_BADGE = {
  available:     { label: 'Mesuré',     color: '#00E5A0' },
  partial_proxy: { label: 'Estimation', color: '#F59E0B' },
  planned:       { label: 'À venir',    color: '#475569' },
} as const;

function ArchetypesSection() {
  const byCategory = new Map<string, typeof PROFILES_V1>();
  const order: string[] = [];
  for (const p of PROFILES_V1) {
    if (!byCategory.has(p.category)) { byCategory.set(p.category, []); order.push(p.category); }
    byCategory.get(p.category)!.push(p);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card>
        <CardTitle mb={10}>Comment lire un score d'archétype</CardTitle>
        <div style={{ color: '#94A3B8', fontSize: '0.82rem', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0 }}>
            Un score n'est pas une note absolue : il situe le joueur <strong style={{ color: '#F1F5F9' }}>par rapport
            aux autres joueurs de son groupe de postes</strong>, sur les indicateurs du profil. 50 % = au milieu
            du groupe, 90 % = parmi les plus marqués.
          </p>
          <p style={{ margin: 0 }}>
            Deux mentions accompagnent un score, et elles ne disent pas la même chose :
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 2 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Badge color="#F59E0B" label="?" size="sm" />
              <span><strong style={{ color: '#F1F5F9' }}>Fiabilité</strong> — dépend du joueur : trop peu de
              matchs ou de minutes pour que le score soit significatif. Il est alors rapproché de la moyenne.</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Badge color="#F59E0B" label="Estimation" size="sm" />
              <span><strong style={{ color: '#F1F5F9' }}>Limite de méthode</strong> — dépend du profil, jamais du
              joueur : certains rôles ne sont pas entièrement mesurables avec les données saisies (pas de types
              d'action, pas de déviations, pas de zones de tir).</span>
            </div>
          </div>
          <p style={{ margin: 0, color: '#64748B', fontSize: '0.78rem' }}>
            Un profil ne promet rien que ses indicateurs ne mesurent : c'est pourquoi certains portent un nom
            descriptif plutôt qu'un nom de rôle. Le détail des seuils est dans <code>docs/CALCULS.md</code>.
          </p>
        </div>
      </Card>

      {order.map(cat => (
        <Card key={cat}>
          <CardTitle mb={10}>{CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]}</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {byCategory.get(cat)!.map(p => (
              <div key={p.key} style={{ borderBottom: '1px solid #1A1F27', paddingBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                  <span style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600 }}>{p.label}</span>
                  <Badge color={STATUS_BADGE[p.status].color} label={STATUS_BADGE[p.status].label} size="sm" />
                  {p.eligiblePositions && (
                    <span style={{ color: '#475569', fontSize: '0.7rem' }}>{p.eligiblePositions.join(' · ')}</span>
                  )}
                </div>
                <p style={{ color: '#94A3B8', fontSize: '0.8rem', lineHeight: 1.55, margin: '0 0 5px' }}>
                  {p.description}
                </p>
                <p style={{ color: '#64748B', fontSize: '0.72rem', margin: 0 }}>
                  Construit sur : {p.indicators.map(i => `${i.featureKey}${i.weight < 0 ? ' (−)' : ''}`).join(', ')}
                </p>
                {p.caveat && (
                  <p style={{ color: '#475569', fontSize: '0.72rem', lineHeight: 1.5, margin: '5px 0 0', fontStyle: 'italic' }}>
                    {p.caveat}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card>
        <CardTitle mb={10}>Dimensions de style</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DIMENSIONS_V1.map(d => (
            <div key={d.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 600 }}>{d.label}</span>
                <Badge color={STATUS_BADGE[d.status].color} label={STATUS_BADGE[d.status].label} size="sm" />
              </div>
              <p style={{ color: '#94A3B8', fontSize: '0.78rem', lineHeight: 1.5, margin: '2px 0 0' }}>{d.description}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

/**
 * Page d'aide : glossaire, formules, FAQ et méthodologie des archétypes.
 *
 * Le glossaire et les formules sont GÉNÉRÉS depuis le registre d'indicateurs. C'est le point
 * important : sans ça, on obtiendrait une troisième version des explications (après les tooltips et
 * `docs/CALCULS.md`), qui divergerait au premier changement de calcul.
 */
export default function HelpPage() {
  const navigate = useNavigate();
  const { section: slug } = useParams<{ section?: string }>();
  const current: Section = isSection(slug) ? slug : 'glossaire';

  useEffect(() => {
    if (!isSection(slug)) navigate(`/aide/${current}`, { replace: true });
  }, [slug, current, navigate]);

  const groups: TabNavGroup[] = [{
    tabs: SECTIONS.map(s => ({ key: s.key, slug: `/aide/${s.key}`, label: s.label })),
  }];

  return (
    <div className="p-4 md:p-6">
      <h1 style={{ color: '#F1F5F9', margin: '0 0 6px' }}>Aide</h1>
      <p style={{ color: '#64748B', fontSize: '0.85rem', margin: '0 0 24px' }}>
        À quoi correspond chaque chiffre de l'app, et comment le lire.
      </p>

      <div className="flex flex-col lg:flex-row" style={{ gap: 20 }}>
        <div style={{ marginBottom: 4 }}>
          <ResponsiveTabNav groups={groups} activeKey={current} onSelect={path => navigate(path)} />
        </div>
        <div style={{ width: '100%', minWidth: 0, flex: 1 }}>
          {current === 'glossaire'  && <GlossarySection />}
          {current === 'formules'   && <FormulasSection />}
          {current === 'faq'        && <FaqSection />}
          {current === 'archetypes' && <ArchetypesSection />}
        </div>
      </div>
    </div>
  );
}
