import { supabase } from './client';
import type { SessionDocument } from '../data/types';

const BUCKET = 'session-documents';

function toDoc(row: Record<string, unknown>): SessionDocument {
  return {
    id:          row.id as string,
    sessionId:   row.session_id as string,
    storagePath: row.storage_path as string,
    name:        row.name as string,
    mimeType:    row.mime_type as string | undefined,
    size:        row.size as number | undefined,
    createdAt:   row.created_at as string,
  };
}

export const documentsApi = {
  async list(sessionId: string): Promise<SessionDocument[]> {
    const { data, error } = await supabase
      .from('session_documents')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at');
    if (error) throw error;
    return (data ?? []).map(toDoc);
  },

  async upload(sessionId: string, file: File): Promise<SessionDocument> {
    const ext  = file.name.split('.').pop() ?? 'bin';
    const path = `${sessionId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file);
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from('session_documents')
      .insert({
        session_id:   sessionId,
        storage_path: path,
        name:         file.name,
        mime_type:    file.type || null,
        size:         file.size,
      })
      .select()
      .single();

    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw error;
    }
    return toDoc(data as Record<string, unknown>);
  },

  async getSignedUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  },

  async remove(doc: SessionDocument): Promise<void> {
    await supabase.storage.from(BUCKET).remove([doc.storagePath]);
    const { error } = await supabase
      .from('session_documents')
      .delete()
      .eq('id', doc.id);
    if (error) throw error;
  },
};
