interface EmptyStateProps {
  message: string;
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({ message, size = 'md' }: EmptyStateProps) {
  const py = size === 'sm' ? 20 : size === 'lg' ? 56 : 40;
  return (
    <div style={{ textAlign: 'center', padding: `${py}px 16px` }}>
      <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>{message}</p>
    </div>
  );
}
