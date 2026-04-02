import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type WaitlistInsert = {
  email: string;
  role?: string | null;
};

type Database = {
  public: {
    Tables: {
      waitlist: {
        Row: {
          id: number;
          email: string;
          role: string | null;
          created_at: string;
        };
        Insert: WaitlistInsert;
        Update: Partial<WaitlistInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase: SupabaseClient<Database> = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
