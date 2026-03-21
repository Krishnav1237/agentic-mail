ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS personality_mode text NOT NULL DEFAULT 'proactive';
