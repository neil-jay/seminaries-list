import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceRows } from './source-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.join(__dirname, 'seed.sql');

const q = (value) => String(value ?? '').replace(/'/g, "''");

function normalizeCountry(raw) {
  const v = String(raw || '').trim();
  if (!v) return 'Unknown';
  const map = {
    'United States': 'United States',
    'U.S.': 'United States',
    'USA': 'United States',
    'Canada': 'Canada',
    'India': 'India',
    'Australia': 'Australia',
    'Sri Lanka': 'Sri Lanka',
    'Bangladesh': 'Bangladesh'
  };
  return map[v] || v;
}

function parseLocation(rawLocation) {
  const entry = String(rawLocation || '').trim();
  if (!entry) return { city: null, locality: null, region: null, raw: null };

  const parts = entry.split(',').map((p) => p.trim()).filter(Boolean);

  if (parts.length >= 2) {
    return {
      city: parts[0],
      locality: parts.length >= 3 ? parts[1] : null,
      region: parts[parts.length - 1],
      raw: entry
    };
  }

  return { city: entry, locality: null, region: null, raw: entry };
}

function collectSource(sourceName, sourceUrl, sourceType, notes) {
  const sourceKey = `${sourceName}::${sourceUrl}`;
  return { sourceKey, sourceName, sourceUrl, sourceType, notes };
}

const sourceMap = new Map();
const countryMap = new Map();
const regionMap = new Map();
const locationMap = new Map();
const institutionMap = new Map();
const institutionNameMap = new Map();
const sourceRowsSql = [];
const countryRowsSql = [];
const regionRowsSql = [];
const locationRowsSql = [];
const institutionTypeRowsSql = [];
const institutionRowsSql = [];
const institutionNameRowsSql = [];
const institutionSourceRowsSql = [];
const institutionLocationRowsSql = [];
const sqlStatements = [];

const defaultInstitutionType = 'seminary';

for (const row of sourceRows) {
  const resolvedType = row.institutionType || defaultInstitutionType;
  const source = collectSource(row.sourceName, row.sourceUrl, row.sourceType, row.notes);
  if (!sourceMap.has(source.sourceKey)) {
    sourceMap.set(source.sourceKey, source);
    sourceRowsSql.push({
      source_name: source.sourceName,
      source_url: source.sourceUrl,
      source_type: source.sourceType,
      citation_text: source.notes,
      coverage_note: source.notes
    });
  }

  const normalizedCountry = normalizeCountry(row.country);
  if (!countryMap.has(normalizedCountry)) {
    countryMap.set(normalizedCountry, { name: normalizedCountry, iso_code: null, region_group: null });
    countryRowsSql.push({ name: normalizedCountry, iso_code: null, region_group: null });
  }

  const parsed = parseLocation(row.location);
  const countryIdKey = normalizedCountry;
  const regionKey = `${countryIdKey}::${parsed.region ?? 'UNKNOWN_REGION'}`;
  if (parsed.region && !regionMap.has(regionKey)) {
    regionMap.set(regionKey, { country_name: normalizedCountry, name: parsed.region, division_type: 'state_or_province' });
    regionRowsSql.push({ country_name: normalizedCountry, name: parsed.region, division_type: 'state_or_province' });
  }

  const locationKey = `${countryIdKey}::${parsed.city ?? 'UNKNOWN_CITY'}::${parsed.locality ?? ''}::${parsed.region ?? ''}`;
  if (!locationMap.has(locationKey)) {
    locationMap.set(locationKey, {
      country_name: normalizedCountry,
      city: parsed.city,
      locality: parsed.locality,
      region_name: parsed.region,
      raw_location_text: row.location
    });
    locationRowsSql.push({
      country_name: normalizedCountry,
      city: parsed.city,
      locality: parsed.locality,
      region_name: parsed.region,
      raw_location_text: row.location
    });
  }

  const institutionKey = `${normalizedCountry}::${row.seminary}`;
  if (!institutionMap.has(institutionKey)) {
    institutionMap.set(institutionKey, {
      canonical_name: row.seminary,
      country_name: normalizedCountry,
      institution_type: defaultInstitutionType,
      status: 'active',
      confidence_score: 0.8,
      notes: row.notes
    });
    institutionTypeRowsSql.push({ name: resolvedType });
    institutionRowsSql.push({
      canonical_name: row.seminary,
      country_name: normalizedCountry,
      institution_type: resolvedType,
      status: 'active',
      confidence_score: 0.8,
      notes: row.notes
    });
    institutionNameRowsSql.push({
      canonical_name: row.seminary,
      country_name: normalizedCountry,
      name: row.seminary,
      name_type: 'official',
      language: 'en'
    });
  }

  const institutionSourceKey = `${institutionKey}::${source.sourceKey}`;
  if (!institutionNameMap.has(institutionSourceKey)) {
    institutionNameMap.set(institutionSourceKey, true);
    institutionSourceRowsSql.push({
      institution_name: row.seminary,
      country_name: normalizedCountry,
      source_name: source.sourceName,
      source_url: source.sourceUrl,
      extracted_row_text: `${normalizedCountry} | ${row.seminary} | ${row.location}`,
      confidence_score: 0.8
    });
  }

  institutionLocationRowsSql.push({
    institution_name: row.seminary,
    country_name: normalizedCountry,
    city: parsed.city,
    locality: parsed.locality,
    region_name: parsed.region,
    raw_location_text: row.location
  });
}

const insertStatements = [];

insertStatements.push("PRAGMA foreign_keys = ON;");

for (const row of sourceRowsSql) {
  insertStatements.push(
    `INSERT OR IGNORE INTO sources (source_name, source_url, source_type, citation_text, coverage_note) VALUES ('${q(row.source_name)}', '${q(row.source_url)}', '${q(row.source_type)}', '${q(row.citation_text)}', '${q(row.coverage_note)}');`
  );
}

for (const row of countryRowsSql) {
  insertStatements.push(
    `INSERT OR IGNORE INTO countries (name, iso_code, region_group) VALUES ('${q(row.name)}', ${row.iso_code ? `'${q(row.iso_code)}'` : 'NULL'}, ${row.region_group ? `'${q(row.region_group)}'` : 'NULL'});`
  );
}

for (const row of regionRowsSql) {
  insertStatements.push(
    `INSERT INTO regions (country_id, name, division_type) SELECT country_id, '${q(row.name)}', '${q(row.division_type)}' FROM countries WHERE name = '${q(row.country_name)}';`
  );
}

for (const row of locationRowsSql) {
  insertStatements.push(
    `INSERT INTO locations (country_id, region_id, city, locality, raw_location_text) SELECT c.country_id, (SELECT r.region_id FROM regions r WHERE r.country_id = c.country_id AND r.name = '${q(row.region_name || '')}' LIMIT 1), '${q(row.city || '')}', ${row.locality ? `'${q(row.locality)}'` : 'NULL'}, '${q(row.raw_location_text || '')}' FROM countries c WHERE c.name = '${q(row.country_name)}';`
  );
}

for (const row of institutionTypeRowsSql) {
  insertStatements.push(
    `INSERT OR IGNORE INTO institution_types (name) VALUES ('${q(row.name)}');`
  );
}

for (const row of institutionRowsSql) {
  insertStatements.push(
    `INSERT OR IGNORE INTO institutions (canonical_name, country_id, institution_type_id, status, confidence_score, notes) VALUES ('${q(row.canonical_name)}', (SELECT country_id FROM countries WHERE name = '${q(row.country_name)}'), (SELECT institution_type_id FROM institution_types WHERE name = '${q(row.institution_type)}'), '${q(row.status)}', ${row.confidence_score}, '${q(row.notes || '')}');`
  );
}

for (const row of institutionNameRowsSql) {
  insertStatements.push(
    `INSERT OR IGNORE INTO institution_names (institution_id, name, name_type, language) VALUES ((SELECT institution_id FROM institutions WHERE canonical_name = '${q(row.canonical_name)}' AND country_id = (SELECT country_id FROM countries WHERE name = '${q(row.country_name)}')), '${q(row.name)}', '${q(row.name_type)}', '${q(row.language)}');`
  );
}

for (const row of institutionSourceRowsSql) {
  insertStatements.push(
    `INSERT INTO institution_sources (institution_id, source_id, extracted_row_text, confidence_score) VALUES ((SELECT institution_id FROM institutions WHERE canonical_name = '${q(row.institution_name)}' AND country_id = (SELECT country_id FROM countries WHERE name = '${q(row.country_name)}')), (SELECT source_id FROM sources WHERE source_name = '${q(row.source_name)}' AND source_url = '${q(row.source_url || '')}' LIMIT 1), '${q(row.extracted_row_text)}', ${row.confidence_score});`
  );
}

for (const row of institutionLocationRowsSql) {
  insertStatements.push(
    `INSERT INTO institution_locations (institution_id, location_id, is_primary) VALUES ((SELECT institution_id FROM institutions WHERE canonical_name = '${q(row.institution_name)}' AND country_id = (SELECT country_id FROM countries WHERE name = '${q(row.country_name)}')), (SELECT location_id FROM locations WHERE country_id = (SELECT country_id FROM countries WHERE name = '${q(row.country_name)}') AND city = '${q(row.city || '')}' AND COALESCE(locality, '') = '${q(row.locality || '')}' LIMIT 1), 1);`
  );
}

fs.writeFileSync(outputPath, `${insertStatements.join('\n')}\n`, 'utf8');

console.log(`Generated ${insertStatements.length} SQL statements in ${outputPath}`);
