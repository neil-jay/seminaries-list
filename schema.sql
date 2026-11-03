PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS raw_seminary_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  source_url TEXT,
  country_raw TEXT,
  seminary_raw TEXT,
  location_raw TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS countries (
  country_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  iso_code TEXT,
  region_group TEXT
);

CREATE TABLE IF NOT EXISTS regions (
  region_id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  division_type TEXT NOT NULL,
  FOREIGN KEY (country_id) REFERENCES countries(country_id)
);

CREATE TABLE IF NOT EXISTS locations (
  location_id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id INTEGER NOT NULL,
  region_id INTEGER,
  city TEXT,
  locality TEXT,
  raw_location_text TEXT,
  FOREIGN KEY (country_id) REFERENCES countries(country_id),
  FOREIGN KEY (region_id) REFERENCES regions(region_id)
);

CREATE TABLE IF NOT EXISTS institution_types (
  institution_type_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS institutions (
  institution_id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_name TEXT NOT NULL,
  country_id INTEGER,
  institution_type_id INTEGER,
  status TEXT NOT NULL DEFAULT 'unknown',
  confidence_score REAL DEFAULT 0.50,
  notes TEXT,
  FOREIGN KEY (country_id) REFERENCES countries(country_id),
  FOREIGN KEY (institution_type_id) REFERENCES institution_types(institution_type_id)
);

CREATE TABLE IF NOT EXISTS institution_names (
  institution_name_id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  name_type TEXT DEFAULT 'variant',
  language TEXT,
  FOREIGN KEY (institution_id) REFERENCES institutions(institution_id)
);

CREATE TABLE IF NOT EXISTS affiliations (
  affiliation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_id INTEGER NOT NULL,
  church_body TEXT,
  jurisdiction_name TEXT,
  affiliation_type TEXT,
  FOREIGN KEY (institution_id) REFERENCES institutions(institution_id)
);

CREATE TABLE IF NOT EXISTS sources (
  source_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT,
  citation_text TEXT,
  coverage_note TEXT
);

CREATE TABLE IF NOT EXISTS institution_sources (
  institution_source_id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_id INTEGER NOT NULL,
  source_id INTEGER NOT NULL,
  extracted_row_text TEXT,
  confidence_score REAL DEFAULT 0.50,
  FOREIGN KEY (institution_id) REFERENCES institutions(institution_id),
  FOREIGN KEY (source_id) REFERENCES sources(source_id)
);

CREATE TABLE IF NOT EXISTS institution_locations (
  institution_location_id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  is_primary INTEGER DEFAULT 1 CHECK (is_primary IN (0, 1)),
  FOREIGN KEY (institution_id) REFERENCES institutions(institution_id),
  FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

CREATE INDEX IF NOT EXISTS idx_countries_name ON countries(name);
CREATE INDEX IF NOT EXISTS idx_locations_country_region ON locations(country_id, region_id);
CREATE INDEX IF NOT EXISTS idx_institutions_name ON institutions(canonical_name);
CREATE INDEX IF NOT EXISTS idx_institution_names_name ON institution_names(name);
CREATE INDEX IF NOT EXISTS idx_sources_name ON sources(source_name);

CREATE VIEW IF NOT EXISTS v_seminaries AS
SELECT
  c.name AS country,
  r.name AS region,
  l.city,
  l.locality,
  i.canonical_name AS seminary_name,
  it.name AS institution_type,
  i.status,
  i.confidence_score
FROM institutions i
LEFT JOIN institution_types it
  ON i.institution_type_id = it.institution_type_id
LEFT JOIN institution_locations il
  ON i.institution_id = il.institution_id
LEFT JOIN locations l
  ON il.location_id = l.location_id
LEFT JOIN countries c
  ON l.country_id = c.country_id
LEFT JOIN regions r
  ON l.region_id = r.region_id;
