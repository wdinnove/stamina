import { X } from 'lucide-react';
import { players } from '../../../data';

interface ActionFormProps {
  onClose: () => void;
}

export function ActionForm({ onClose }: ActionFormProps) {
  const t1 = players.filter(p => p.teamId === 't1');
  const input = { width: '100%', padding: '8px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' as const };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ color: '#F1F5F9', margin: 0 }}>Nouvelle action</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={e => { e.preventDefault(); onClose(); }}>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Joueur concernée</label>
            <select style={input}>
              {t1.map(p => <option key={p.id}>{p.firstName} {p.lastName}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Titre de l'action</label>
            <input type="text" placeholder="Ex : Séance kiné matin" style={input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Catégorie</label>
              <select style={input}>
                {['Médical','Physique','Mental','Tactique','Entretien','Vidéo','Discussion','Admin.'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Priorité</label>
              <select style={input}>
                {['Faible','Normale','Haute','Critique'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Date limite</label>
              <input type="date" style={input} />
            </div>
            <div>
              <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Assigné à</label>
              <input type="text" placeholder="Staff member" style={input} />
            </div>
          </div>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Description</label>
            <textarea placeholder="Description détaillée..." style={{ ...input, resize: 'vertical', minHeight: 72, fontFamily: 'Inter, sans-serif' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
            <button type="submit" style={{ flex: 1, padding: '10px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700 }}>Créer</button>
          </div>
        </form>
      </div>
    </div>
  );
}
