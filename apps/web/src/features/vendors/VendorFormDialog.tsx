'use client';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Grid from '@mui/material/Grid';
import { CreateVendorSchema, UpdateVendorSchema, type CreateVendorInput, type Vendor } from '@smartcode/types';
import { Alert, Button, Input, Modal, useToast } from '@smartcode/ui';
import { errorMessage } from '@/lib/format';
import { useCreateVendor, useUpdateVendor } from './use-vendors';

/** Create (vendor = null) or edit a vendor. The code is permanent once created. Mounted only while open. */
export function VendorFormDialog({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const { showToast } = useToast();
  const create = useCreateVendor();
  const update = useUpdateVendor();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const editing = !!vendor;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateVendorInput>({
    resolver: zodResolver(editing ? (UpdateVendorSchema as never) : CreateVendorSchema),
    defaultValues: { name: vendor?.name ?? '', code: vendor?.code ?? '', contactName: vendor?.contactName ?? '', contactEmail: vendor?.contactEmail ?? '' },
  });
  const busy = create.isPending || update.isPending;

  const onSubmit = (values: CreateVendorInput) => {
    setServerError(null);
    const done = (msg: string) => {
      showToast(msg, 'success');
      onClose();
    };
    const fail = (err: unknown) => setServerError(errorMessage(err, 'Could not save the vendor.'));
    if (vendor) {
      update.mutate(
        { id: vendor.id, input: { name: values.name, contactName: values.contactName ?? '', contactEmail: values.contactEmail ?? '' } },
        { onSuccess: () => done(`Vendor ${values.name} updated.`), onError: fail },
      );
    } else {
      create.mutate(values, { onSuccess: (v) => done(`Vendor ${v.name} created.`), onError: fail });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit vendor - ${vendor!.code}` : 'Create Vendor'}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={busy}>
            {busy ? 'Saving...' : editing ? 'Save Changes' : 'Create Vendor'}
          </Button>
        </>
      }
    >
      {serverError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {serverError}
        </Alert>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={8}>
            <Input label="Vendor Name" error={!!errors.name} helperText={errors.name?.message} {...register('name')} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Input
              label="Vendor Code"
              disabled={editing}
              error={!!errors.code}
              helperText={errors.code?.message ?? (editing ? 'Permanent' : 'e.g. ALPHA')}
              {...register('code')}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Input label="Contact Name" error={!!errors.contactName} helperText={errors.contactName?.message} {...register('contactName')} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Input label="Contact Email" error={!!errors.contactEmail} helperText={errors.contactEmail?.message} {...register('contactEmail')} />
          </Grid>
        </Grid>
      </form>
    </Modal>
  );
}
