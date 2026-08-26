import type { VitalRange } from './types';

/**
 * Normal vital-sign ranges by age.
 *
 * Deliberately given as awake, at-rest ranges for a well child or adult — the
 * point of the table is to recognize an abnormal number quickly, not to define
 * a treatment threshold. As everywhere in the book, local protocol governs.
 */

/** The chapter id the vitals table is presented under, for search breadcrumbs. */
export const VITALS_CHAPTER_ID = 'vitals';
export const VITALS_CHAPTER_TITLE = 'Vital signs by age';

export const VITAL_RANGES: readonly VitalRange[] = [
  {
    id: 'vitals-newborn',
    ageGroup: 'Newborn',
    age: '0–1 month',
    heartRate: '100–180',
    respiratoryRate: '30–60',
    systolic: '60–90',
  },
  {
    id: 'vitals-infant',
    ageGroup: 'Infant',
    age: '1–12 months',
    heartRate: '100–160',
    respiratoryRate: '25–50',
    systolic: '70–95',
  },
  {
    id: 'vitals-toddler',
    ageGroup: 'Toddler',
    age: '1–3 years',
    heartRate: '90–150',
    respiratoryRate: '20–30',
    systolic: '80–100',
  },
  {
    id: 'vitals-preschool',
    ageGroup: 'Preschool',
    age: '3–5 years',
    heartRate: '80–140',
    respiratoryRate: '20–25',
    systolic: '80–100',
  },
  {
    id: 'vitals-school-age',
    ageGroup: 'School age',
    age: '6–12 years',
    heartRate: '70–120',
    respiratoryRate: '15–20',
    systolic: '80–110',
  },
  {
    id: 'vitals-adolescent',
    ageGroup: 'Adolescent',
    age: '13–18 years',
    heartRate: '60–100',
    respiratoryRate: '12–20',
    systolic: '90–120',
  },
  {
    id: 'vitals-adult',
    ageGroup: 'Adult',
    age: '18 years and older',
    heartRate: '60–100',
    respiratoryRate: '12–20',
    systolic: '90–140',
  },
];

/** Rules of thumb that sit under the table, where a range alone is not enough. */
export const VITALS_NOTES: readonly string[] = [
  'Minimum acceptable systolic pressure in a child aged 1–10 years is roughly 70 + (2 × age in years).',
  'Tachycardia is the earliest reliable sign of shock in a child. Hypotension is a late and ominous one.',
  'Normal oxygen saturation is about 94–99% on room air. Pulse oximetry reads falsely normal in carbon monoxide poisoning.',
  'Normal end-tidal CO2 is about 35–45 mmHg with a squared waveform.',
  'Normal blood glucose is roughly 70–140 mg/dL; treat symptomatic hypoglycemia below about 70.',
  'A single set of vitals is a data point. Only a second set tells you which direction the patient is moving.',
];
