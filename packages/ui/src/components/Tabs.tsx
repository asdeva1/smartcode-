'use client';
import MuiTabs from '@mui/material/Tabs';
import MuiTab from '@mui/material/Tab';

export interface TabItem {
  value: string;
  label: string;
}

export interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  items: TabItem[];
}

export function Tabs({ value, onChange, items }: TabsProps) {
  return (
    <MuiTabs value={value} onChange={(_, v) => onChange(v)} sx={{ minHeight: 40 }}>
      {items.map((item) => (
        <MuiTab key={item.value} value={item.value} label={item.label} sx={{ minHeight: 40, textTransform: 'none' }} />
      ))}
    </MuiTabs>
  );
}
