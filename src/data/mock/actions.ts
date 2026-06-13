import type { Action } from '../types';

export const actions: Action[] = [
  { id: 'a1',  playerId: 'p3', title: 'Séance kiné cheville',        description: 'Rééducation proprioceptive — protocole RTP étape 2',     category: 'medical',   priority: 'high',     dueDate: '2026-01-12', assignedTo: 'Dr Moreau',      status: 'todo'        },
  { id: 'a2',  playerId: 'p8', title: 'Analyse vidéo défense 2-3',   description: 'Révision positionnement en zone — match vs Antibes',      category: 'video',     priority: 'normal',   dueDate: '2026-01-15', assignedTo: 'Thomas Martin',  status: 'in_progress' },
  { id: 'a3',  playerId: 'p7', title: 'Entretien mi-saison',         description: 'Bilan individuel — objectifs second tour',                category: 'interview', priority: 'high',     dueDate: '2026-01-14', assignedTo: 'Thomas Martin',  status: 'todo'        },
  { id: 'a4',  playerId: 'p6', title: 'Bilan médical lombaires',     description: 'Évaluation progression RTP — étape 1',                   category: 'medical',   priority: 'high',     dueDate: '2026-01-13', assignedTo: 'Dr Moreau',      status: 'todo'        },
  { id: 'a5',  playerId: 'p4', title: 'Renforcement épaules',        description: 'Programme préventif pivot — résistance bras',             category: 'physical',  priority: 'normal',   dueDate: '2026-01-16', assignedTo: 'Julien Rousseau',status: 'todo'        },
  { id: 'a6',  playerId: 'p1', title: 'Discussion informelle',       description: 'Point rapide charge mentale fin de phase aller',          category: 'discussion',priority: 'low',      dueDate: '2026-01-15', assignedTo: 'Thomas Martin',  status: 'in_progress' },
  { id: 'a7',  playerId: 'p3', title: 'Test fonctionnel cheville',   description: 'Évaluation stabilité et force isométrique',               category: 'medical',   priority: 'critical', dueDate: '2026-01-20', assignedTo: 'Dr Moreau',      status: 'todo'        },
  { id: 'a8',  playerId: 'p2', title: 'Séance tirs libres',          description: 'Travail spécifique LT — objectif > 70%',                 category: 'tactical',  priority: 'normal',   dueDate: '2026-01-17', assignedTo: 'Thomas Martin',  status: 'done'        },
  { id: 'a9',  playerId: 'p5', title: 'Analyse vidéo pressing',      description: 'Étude du pressing adverse — préparation match Rouen',     category: 'video',     priority: 'normal',   dueDate: '2026-01-16', assignedTo: 'Thomas Martin',  status: 'waiting'     },
  { id: 'a10', playerId: 'p9', title: 'Entretien coach',             description: 'Discussion rôle en rotation et temps de jeu',             category: 'interview', priority: 'normal',   dueDate: '2026-01-18', assignedTo: 'Thomas Martin',  status: 'todo'        },
];
