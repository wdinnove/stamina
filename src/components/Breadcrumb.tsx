import { Link } from 'react-router';

export interface BreadcrumbItem {
  label: string;
  path: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  if (items.length === 0) return null;
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
      {items.map((item, i) => (
        <span key={item.path} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span style={{ color: '#2A2F3A', userSelect: 'none' }}>/</span>}
          <Link
            to={item.path}
            style={{ color: '#94A3B8', textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#F1F5F9')}
            onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}
          >
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
