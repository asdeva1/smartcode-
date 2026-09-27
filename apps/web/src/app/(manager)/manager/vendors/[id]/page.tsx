'use client';
import { useParams } from 'next/navigation';
import { VendorDetail } from '@/features/vendors/VendorDetail';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <VendorDetail key={id} id={id} />;
}
