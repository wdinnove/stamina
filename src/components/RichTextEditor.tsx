import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered } from 'lucide-react';

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
};

const EMPTY = '<p></p>';

export default function RichTextEditor({ value, onChange, placeholder, minHeight = 80, disabled = false }: Props) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    editable: !disabled,
    immediatelyRender: false,
    onUpdate({ editor }) {
      const html = editor.getHTML();
      onChange(html === EMPTY ? '' : html);
    },
    editorProps: {
      attributes: {
        class: 'rte-content',
      },
    },
  });

  // Sync external resets (e.g. form clear)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = value || '';
    if (next !== current && next !== (current === EMPTY ? '' : current)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  function btn(active: boolean, action: () => void, icon: React.ReactNode, title: string) {
    return (
      <button
        type="button"
        title={title}
        onMouseDown={e => { e.preventDefault(); action(); }}
        style={{
          padding: '4px 8px',
          borderRadius: 4,
          border: 'none',
          backgroundColor: active ? 'rgba(0,229,160,0.12)' : 'transparent',
          color: active ? '#00E5A0' : '#64748B',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          transition: 'color 0.1s, background-color 0.1s',
        }}
        onMouseEnter={e => {
          if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#94A3B8';
        }}
        onMouseLeave={e => {
          if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#64748B';
        }}
      >
        {icon}
      </button>
    );
  }

  if (!editor) return null;

  return (
    <>
      <style>{`
        .rte-wrap { background: #1E2229; border: 1px solid #2A2F3A; border-radius: 6px; overflow: hidden; height: 100%; display: flex; flex-direction: column; }
        .rte-wrap:focus-within { border-color: #3A4454; }
        .rte-toolbar { display: flex; align-items: center; gap: 2px; padding: 5px 8px; border-bottom: 1px solid #2A2F3A; background: #161920; flex-shrink: 0; }
        .rte-body { padding: 10px 12px; position: relative; flex: 1; display: flex; flex-direction: column; }
        .rte-placeholder { position: absolute; top: 10px; left: 12px; color: #475569; font-size: 0.85rem; pointer-events: none; line-height: 1.6; }
        .rte-content { outline: none; color: #F1F5F9; font-size: 0.85rem; line-height: 1.6; flex: 1; }
        .rte-content p { margin: 0 0 4px; }
        .rte-content p:last-child { margin-bottom: 0; }
        .rte-content ul { list-style: disc outside; padding-left: 1.3em; margin: 2px 0; }
        .rte-content ol { list-style: decimal outside; padding-left: 1.3em; margin: 2px 0; }
        .rte-content li { margin-bottom: 2px; display: list-item; }
        .rte-content strong { color: #F1F5F9; }
        .rte-content em { color: #CBD5E1; }
      `}</style>
      <div className="rte-wrap">
        <div className="rte-toolbar">
          {btn(editor.isActive('bold'),        () => editor.chain().focus().toggleBold().run(),         <Bold size={13} />,        'Gras')}
          {btn(editor.isActive('italic'),      () => editor.chain().focus().toggleItalic().run(),       <Italic size={13} />,      'Italique')}
          <div style={{ width: 1, height: 14, backgroundColor: '#2A2F3A', margin: '0 3px' }} />
          {btn(editor.isActive('bulletList'),  () => editor.chain().focus().toggleBulletList().run(),  <List size={13} />,        'Liste à puces')}
          {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={13} />, 'Liste numérotée')}
        </div>
        <div className="rte-body" style={{ minHeight }}>
          {editor.isEmpty && placeholder && (
            <span className="rte-placeholder">{placeholder}</span>
          )}
          <EditorContent editor={editor} style={{ flex: 1, display: 'flex', flexDirection: 'column' }} />
        </div>
      </div>
    </>
  );
}
