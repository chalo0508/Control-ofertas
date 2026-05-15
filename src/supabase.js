import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://yjxcqtznnjafzbvveibq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGNxdHpubmphZnpidnZlaWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MzkwMTQsImV4cCI6MjA5NDQxNTAxNH0.V6VpkskHNQjSTocRFawHTaq6bBNJw6JZhhLTs_Lp068'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
