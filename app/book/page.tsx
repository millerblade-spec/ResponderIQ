import type { Metadata } from 'next';
import { ParamedicBook } from '@/components/ParamedicBook/ParamedicBook';

export const metadata: Metadata = {
  title: 'Paramedic Book — ResponderIQ',
  description: 'Searchable paramedic field reference: assessment, airway, cardiac, trauma, formulary and vitals.',
};

export default function BookPage() {
  return <ParamedicBook />;
}
