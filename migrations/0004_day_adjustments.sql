ALTER TABLE mutation_receipts ADD COLUMN assigned_date TEXT;
ALTER TABLE mutation_receipts ADD COLUMN expected_entries_json TEXT;
CREATE TRIGGER check_day_mutation BEFORE INSERT ON mutation_receipts
WHEN NEW.kind='day' BEGIN
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM entries WHERE date=NEW.assigned_date AND deleted=0) <> json_array_length(NEW.expected_entries_json)
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.expected_entries_json) AS expected
      WHERE NOT EXISTS (
        SELECT 1 FROM entries
        WHERE id=json_extract(expected.value,'$.id')
          AND date=NEW.assigned_date AND deleted=0
          AND version=json_extract(expected.value,'$.version')
          AND easy=json_extract(expected.value,'$.easy')
          AND external=json_extract(expected.value,'$.external')
          AND logged_at=json_extract(expected.value,'$.loggedAt')
      )
    ) THEN RAISE(ABORT,'day_version_conflict') END;
END;
