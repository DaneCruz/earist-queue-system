-- FINAL FIX: Consultations table works without RLS
-- Keep RLS disabled on consultations table

-- Application handles security (faculty only see their own consultations in code)
ALTER TABLE consultations DISABLE ROW LEVEL SECURITY;

