import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  path: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

// Même langage visuel que les liens « retour » des pages détail (séance, match, réunion,
// exercice) : flèche + libellé, gris muet qui s'éclaircit au survol — pour qu'il n'y ait
// plus deux styles différents pour « revenir en arrière » selon la page.
export function Breadcrumb({ items }: BreadcrumbProps) {
  if (items.length === 0) return null;
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
      {items.map((item, i) => (
        <span key={item.path} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span style={{ color: '#2A2F3A', userSelect: 'none' }}>›</span>}
          <Link
            to={item.path}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#F1F5F9')}
            onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}
          >
            {i === 0 && <ArrowLeft size={14} />}
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
