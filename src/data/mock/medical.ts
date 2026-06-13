import type { MedicalRecord } from '../types';

export const medicalRecords: MedicalRecord[] = [
  { id: 'm1', playerId: 'p3', date: '2026-01-10', type: 'injury',   description: 'Entorse cheville droite (Grade 2)', location: 'Cheville droite', severity: 'moderate', daysAbsent: 14, status: 'active',   rtpDate: '2026-01-24', rtpStep: 2, rtpTotal: 5, treatment: 'Glaçage + strapping + kiné 2×/jour' },
  { id: 'm2', playerId: 'p6', date: '2026-01-08', type: 'injury',   description: 'Douleurs lombaires chroniques',      location: 'Lombaires',       severity: 'mild',     daysAbsent: 5,  status: 'active',   treatment: 'Massage + renforcement core' },
  { id: 'm3', playerId: 'p1', date: '2025-11-15', type: 'injury',   description: 'Contusion genou droit',              location: 'Genou droit',     severity: 'mild',     daysAbsent: 3,  status: 'resolved' },
  { id: 'm4', playerId: 'p2', date: '2025-10-10', type: 'injury',   description: 'Tendinite rotulienne',               location: 'Genou gauche',    severity: 'mild',     daysAbsent: 5,  status: 'resolved' },
  { id: 'm5', playerId: 'p9', date: '2026-01-01', type: 'checkup',  description: 'Bilan médical mi-saison',                                                                               status: 'resolved' },
];
