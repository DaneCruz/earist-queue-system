-- Set up RLS for consultations table to allow faculty updates
-- Run this in Supabase SQL Editor

-- Enable RLS if not already enabled
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Faculty can read their own consultations" ON consultations;
DROP POLICY IF EXISTS "Faculty can update their own consultations" ON consultations;
DROP POLICY IF EXISTS "Students can read their own consultations" ON consultations;
DROP POLICY IF EXISTS "Enable read access" ON consultations;
DROP POLICY IF EXISTS "Enable insert access" ON consultations;
DROP POLICY IF EXISTS "Enable update access" ON consultations;
DROP POLICY IF EXISTS "Public can select" ON consultations;
DROP POLICY IF EXISTS "Authenticated users can insert" ON consultations;

-- Policy 1: Public SELECT access (for loading initial data)
-- This is needed so the SELECT query in loadConsultationQueue() works
CREATE POLICY "Public can select" ON consultations
  FOR SELECT
  USING (true);

-- Policy 2: Faculty can UPDATE their own consultations
CREATE POLICY "Faculty can update own consultations" ON consultations
  FOR UPDATE
  USING (auth.uid() = faculty_id)
  WITH CHECK (auth.uid() = faculty_id);

-- Policy 3: Authenticated users can INSERT (for creating consultations)
CREATE POLICY "Authenticated users can insert" ON consultations
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
