import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ParamedicBook } from './ParamedicBook';
import { BOOK_CHAPTERS, PROTOCOL_DISCLAIMER } from '@/lib/book/content';
import { FORMULARY_CHAPTER_TITLE, MEDICATIONS } from '@/lib/book/formulary';
import { VITALS_CHAPTER_TITLE, VITAL_RANGES } from '@/lib/book/vitals';

function search(term: string) {
  fireEvent.change(screen.getByLabelText(/search the book/i), { target: { value: term } });
}

describe('Paramedic Book', () => {
  it('warns that protocols override the book before showing any of it', () => {
    render(<ParamedicBook />);
    expect(screen.getByText(PROTOCOL_DISCLAIMER)).toBeInTheDocument();
    // The caution is carried by a text label, not by color alone.
    expect(screen.getByText('Caution:')).toBeInTheDocument();
  });

  it('lists every chapter plus the formulary and the vitals table in the contents', () => {
    render(<ParamedicBook />);
    const contents = screen.getByRole('navigation', { name: /contents/i });
    for (const chapter of BOOK_CHAPTERS) {
      expect(within(contents).getByRole('button', { name: chapter.title })).toBeInTheDocument();
    }
    expect(within(contents).getByRole('button', { name: FORMULARY_CHAPTER_TITLE })).toBeInTheDocument();
    expect(within(contents).getByRole('button', { name: VITALS_CHAPTER_TITLE })).toBeInTheDocument();
  });

  it('opens the first chapter by default and renders its entries', () => {
    render(<ParamedicBook />);
    const first = BOOK_CHAPTERS[0];
    expect(screen.getByRole('heading', { level: 2, name: first.title })).toBeInTheDocument();
    for (const entry of first.entries) {
      expect(screen.getByRole('heading', { level: 3, name: entry.title })).toBeInTheDocument();
    }
  });

  it('switches chapters from the contents rail and marks the open one as current', () => {
    render(<ParamedicBook />);
    const target = BOOK_CHAPTERS[2];
    fireEvent.click(screen.getByRole('button', { name: target.title }));

    expect(screen.getByRole('heading', { level: 2, name: target.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: target.title })).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByRole('heading', { level: 3, name: BOOK_CHAPTERS[0].entries[0].title })).not.toBeInTheDocument();
  });

  it('renders every drug card with dose, contraindications and cautions', () => {
    render(<ParamedicBook />);
    fireEvent.click(screen.getByRole('button', { name: FORMULARY_CHAPTER_TITLE }));

    for (const med of MEDICATIONS) {
      expect(screen.getByRole('heading', { level: 3, name: new RegExp(med.name, 'i') })).toBeInTheDocument();
    }
    const epi = MEDICATIONS.find((m) => m.id === 'med-epinephrine')!;
    expect(screen.getByText(epi.adultDose)).toBeInTheDocument();
    expect(screen.getAllByText('Contraindications').length).toBe(MEDICATIONS.length);
    expect(screen.getAllByText('Cautions').length).toBe(MEDICATIONS.length);
  });

  it('renders the vitals table with a row for every age band', () => {
    render(<ParamedicBook />);
    fireEvent.click(screen.getByRole('button', { name: VITALS_CHAPTER_TITLE }));

    const table = screen.getByRole('table');
    for (const range of VITAL_RANGES) {
      expect(within(table).getByRole('rowheader', { name: range.ageGroup })).toBeInTheDocument();
    }
    expect(within(table).getByRole('columnheader', { name: /systolic bp/i })).toBeInTheDocument();
  });

  it('replaces the open chapter with ranked results while searching, and reports the count', () => {
    render(<ParamedicBook />);
    search('tourniquet');

    const results = screen.getByRole('region', { name: /search results/i });
    expect(within(results).getByText('Hemorrhage control')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/result/i);
    // the default chapter's body is no longer on screen
    expect(screen.queryByRole('heading', { level: 3, name: BOOK_CHAPTERS[0].entries[0].title })).not.toBeInTheDocument();
  });

  it('opens the chapter a result lives in and clears the search when a result is chosen', () => {
    render(<ParamedicBook />);
    search('capnography');
    fireEvent.click(screen.getByRole('button', { name: /waveform capnography/i }));

    expect(screen.getByRole('heading', { level: 2, name: /airway and ventilation/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /waveform capnography/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/search the book/i)).toHaveValue('');
  });

  it('jumps to a drug card from a search for its trade name', () => {
    render(<ParamedicBook />);
    search('narcan');
    fireEvent.click(screen.getByRole('button', { name: /naloxone/i }));

    expect(screen.getByRole('heading', { level: 2, name: FORMULARY_CHAPTER_TITLE })).toBeInTheDocument();
    expect(document.getElementById('med-naloxone')).not.toBeNull();
  });

  it('explains an empty result set instead of showing a blank pane', () => {
    render(<ParamedicBook />);
    search('zzzqqx');
    expect(screen.getByText(/nothing in the book matches/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 results');
  });

  it('offers a way back to the dashboard', () => {
    render(<ParamedicBook />);
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', '/dashboard');
  });
});
