import type { MbtiAxisDef, MbtiQuestion } from './types';

/** Les 4 axes, dans l'ordre du code à 4 lettres. */
export const MBTI_AXES: MbtiAxisDef[] = [
  { key: 'EI', a: 'E', b: 'I', label: "Où je prends mon énergie" },
  { key: 'SN', a: 'S', b: 'N', label: 'Comment je recueille l\'information' },
  { key: 'TF', a: 'T', b: 'F', label: 'Comment je décide' },
  { key: 'JP', a: 'J', b: 'P', label: 'Comment je m\'organise' },
];

/** Bornes de l'échelle de réponse. */
export const MBTI_SCALE_MIN = 1;
export const MBTI_SCALE_MAX = 5;

/** Libellés de l'échelle, du désaccord à l'accord — utilisés sur le formulaire public. */
export const MBTI_SCALE_LABELS: { value: number; label: string; short: string }[] = [
  { value: 1, label: "Pas du tout d'accord", short: 'Pas du tout' },
  { value: 2, label: "Plutôt pas d'accord",  short: 'Plutôt non' },
  { value: 3, label: 'Neutre',               short: 'Neutre' },
  { value: 4, label: "Plutôt d'accord",      short: 'Plutôt oui' },
  { value: 5, label: "Tout à fait d'accord", short: 'Tout à fait' },
];

/** Les 24 affirmations — 3 par pôle, soit 6 par axe.
 *  Les `id` sont la clé de stockage en base (`mbti_responses.answers`) : ils ne changent jamais.
 *  Retoucher un `text` reste possible, retirer ou renuméroter une question ne l'est pas sans
 *  migration des réponses déjà collectées. */
export const MBTI_QUESTIONS: MbtiQuestion[] = [
  { id: 1,  pole: 'E', text: "J'adore être avec plein de monde, ça me donne de l'énergie." },
  { id: 2,  pole: 'I', text: "J'ai besoin de moments seule pour me ressourcer." },
  { id: 3,  pole: 'E', text: 'Je réfléchis souvent en parlant à voix haute.' },
  { id: 4,  pole: 'I', text: 'Dans un groupe, je préfère écouter avant de parler.' },
  { id: 5,  pole: 'E', text: "Rencontrer des gens nouveaux me donne de l'énergie plutôt que ça me fatigue." },
  { id: 6,  pole: 'I', text: "Je préfère avoir peu d'amis proches plutôt que beaucoup de connaissances." },
  { id: 7,  pole: 'S', text: "Je me base d'abord sur les faits et sur ce que j'ai déjà vécu." },
  { id: 8,  pole: 'N', text: "J'aime imaginer des idées et des possibilités nouvelles." },
  { id: 9,  pole: 'S', text: "Je préfère qu'on m'explique les choses étape par étape." },
  { id: 10, pole: 'N', text: 'Je repère facilement des liens entre des choses qui semblent différentes.' },
  { id: 11, pole: 'S', text: 'Je préfère me concentrer sur le présent plutôt que sur des suppositions.' },
  { id: 12, pole: 'N', text: "J'aime imaginer plusieurs façons dont l'avenir pourrait se passer." },
  { id: 13, pole: 'T', text: 'Je décide surtout avec la logique, pas avec mes émotions.' },
  { id: 14, pole: 'F', text: 'Ce que ressentent les gens compte souvent plus pour moi que la logique pure.' },
  { id: 15, pole: 'T', text: 'On me trouve parfois trop directe, trop franche.' },
  { id: 16, pole: 'F', text: "L'ambiance du groupe compte beaucoup pour moi, même si je dois faire des compromis." },
  { id: 17, pole: 'T', text: "Je critique facilement une idée si les arguments ne sont pas solides." },
  { id: 18, pole: 'F', text: 'Avant de décider, je pense à ce que ressentent les autres.' },
  { id: 19, pole: 'J', text: "J'aime tout planifier à l'avance et suivre un planning précis." },
  { id: 20, pole: 'P', text: 'Je préfère rester souple et m\'adapter au dernier moment.' },
  { id: 21, pole: 'J', text: 'Ça me soulage vraiment de finir une tâche avant la date limite.' },
  { id: 22, pole: 'P', text: 'Je travaille bien sous pression, souvent à la dernière minute.' },
  { id: 23, pole: 'J', text: "J'aime que tout soit bien rangé et décidé clairement." },
  { id: 24, pole: 'P', text: "J'aime garder plusieurs options possibles le plus longtemps possible." },
];

/** Nombre de réponses attendues — la soumission est refusée en deçà, côté page et côté serveur. */
export const MBTI_QUESTION_COUNT = MBTI_QUESTIONS.length;
