export const SPECIALIZATION_COLORS: Record<string, string> = {
  'Product Design': '#F0F4C3',
  'Furniture': '#D7CCC8',
  'Lighting': '#FFF9C4',
  'Automotive / Transportation': '#FFCDD2',
  'Medical / Healthcare': '#B3E5FC',
  'Consumer Electronics': '#E1BEE7',
  'Interaction': '#B2EBF2',
  'Footwear': '#BCAAA4',
  'Outdoor/Sports': '#C8E6C9',
  'Toys': '#FFE0B2',
  'Packaging': '#CFD8DC',
  'Sustainability': '#DCEDC8',
  'Jewelry': '#F8BBD0',
  'IoT': '#C5CAE9',
  'Wearables/Accessories': '#FFCCBC',
  'Service Design': '#B2DFDB',
  'Transportation': '#FFCDD2',
};

export function getSpecializationColor(spec: string): string {
  const normalized = spec.replace(/\s*\/\s*/g, ' / ').trim();
  return SPECIALIZATION_COLORS[normalized] || '#E0E0E0';
}
