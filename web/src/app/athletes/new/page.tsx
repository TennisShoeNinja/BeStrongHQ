'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import apiClient from '@/lib/api';
import * as Types from '@/lib/types';

const divisions = [
  'Teen I (15-16)',
  'Teen II (16-17)',
  'Teen III (18-19)',
  'Junior (20-23)',
  "Female's Open",
  "Men's Open",
];

const weightClasses = [
  '48 KG',
  '52 KG',
  '56 KG',
  '60 KG',
  '65 KG',
  '67.5 KG',
  '75 KG',
  '82.5 KG',
  '90 KG',
  '100 KG',
  '110 KG',
  '125 KG',
  '140 KG',
  '140+ KG',
];

interface FormData {
  name: string;
  dob: string;
  division: string;
  weight_class: string;
  program_due: string;
  out_from: string;
  out_through: string;
  email: string;
  phone: string;
  membership_no: string;
  lifting_db_link: string;
}

const FIELD_LABEL: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  marginBottom: 6,
};

const INPUT_STYLE: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  fontSize: 13,
  borderRadius: 8,
  backgroundColor: 'var(--cloud-surface-raised)',
  border: '1px solid var(--cloud-border)',
  color: 'var(--cloud-text)',
  outline: 'none',
};

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2
        className="cloud-text"
        style={{
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 14,
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h2>
      <div className="flex flex-col" style={{ gap: 14 }}>
        {children}
      </div>
    </section>
  );
}

export default function NewAthletePage() {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    name: '',
    dob: '',
    division: '',
    weight_class: '',
    program_due: '',
    out_from: '',
    out_through: '',
    email: '',
    phone: '',
    membership_no: '',
    lifting_db_link: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: async (data: Types.AthleteCreate) => {
      return apiClient.createAthlete(data);
    },
    onSuccess: (result) => {
      router.push(`/athletes/${result.id}`);
    },
    onError: (error: unknown) => {
      console.error('Failed to create athlete:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create athlete';
      setErrors({ submit: errorMessage });
    },
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const calculateAge = (dob: string): number | null => {
    if (!dob) return null;
    const today = new Date();
    const birthDate = new Date(dob);
    const ageMs = today.getTime() - birthDate.getTime();
    return Math.floor(ageMs / (365.25 * 86400000));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const age = calculateAge(formData.dob);

    const submitData: Types.AthleteCreate = {
      name: formData.name,
      dob: formData.dob || null,
      age: age,
      division: formData.division || null,
      weight_class: formData.weight_class || null,
      program_due: formData.program_due || null,
      out_from: formData.out_from || null,
      out_through: formData.out_through || null,
      email: formData.email || null,
      phone: formData.phone || null,
      membership_no: formData.membership_no
        ? Number(formData.membership_no)
        : null,
      lifting_db_link: formData.lifting_db_link || null,
    };

    createMutation.mutate(submitData);
  };

  return (
    <div className="min-h-screen">
      <div
        className="mx-auto"
        style={{
          maxWidth: 640,
          padding: 'var(--cloud-s5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--cloud-s4)',
        }}
      >
        {}
        <Link
          href="/athletes"
          className="flex items-center cloud-text-muted"
          style={{
            gap: 4,
            fontSize: 13,
            textDecoration: 'none',
            alignSelf: 'flex-start',
          }}
        >
          <ChevronLeft style={{ width: 14, height: 14 }} />
          Back to Athletes
        </Link>

        <div>
          <h1
            className="cloud-text"
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }}
          >
            New athlete
          </h1>
          <p
            className="cloud-text-muted"
            style={{ fontSize: 13, marginTop: 6 }}
          >
            Create a new athlete profile and add them to your coaching roster.
          </p>
        </div>

        <div className="cloud-panel" style={{ padding: 24 }}>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col" style={{ gap: 28 }}>
              {errors.submit && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.28)',
                    color: '#fca5a5',
                    fontSize: 13,
                  }}
                >
                  {errors.submit}
                </div>
              )}

              <Section title="Basic information">
                <div>
                  <label className="cloud-text" style={FIELD_LABEL}>
                    Name{' '}
                    <span style={{ color: '#fca5a5', fontWeight: 400 }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Enter athlete name"
                    style={{
                      ...INPUT_STYLE,
                      borderColor: errors.name
                        ? 'rgba(239, 68, 68, 0.5)'
                        : 'var(--cloud-border)',
                    }}
                  />
                  {errors.name && (
                    <p
                      style={{
                        color: '#fca5a5',
                        fontSize: 11,
                        marginTop: 6,
                      }}
                    >
                      {errors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label className="cloud-text" style={FIELD_LABEL}>
                    Date of birth
                  </label>
                  <input
                    type="date"
                    name="dob"
                    value={formData.dob}
                    onChange={handleInputChange}
                    style={INPUT_STYLE}
                  />
                </div>
              </Section>

              <Section title="Competition details">
                <div>
                  <label className="cloud-text" style={FIELD_LABEL}>
                    Division
                  </label>
                  <select
                    name="division"
                    value={formData.division}
                    onChange={handleInputChange}
                    style={INPUT_STYLE}
                  >
                    <option value="">Select division</option>
                    {divisions.map((div) => (
                      <option key={div} value={div}>
                        {div}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="cloud-text" style={FIELD_LABEL}>
                    Weight class
                  </label>
                  <select
                    name="weight_class"
                    value={formData.weight_class}
                    onChange={handleInputChange}
                    style={INPUT_STYLE}
                  >
                    <option value="">Select weight class</option>
                    {weightClasses.map((wc) => (
                      <option key={wc} value={wc}>
                        {wc}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="cloud-text" style={FIELD_LABEL}>
                    Program due date
                  </label>
                  <input
                    type="date"
                    name="program_due"
                    value={formData.program_due}
                    onChange={handleInputChange}
                    style={INPUT_STYLE}
                  />
                </div>
              </Section>

              <Section title="Availability">
                <div
                  className="grid"
                  style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}
                >
                  <div>
                    <label className="cloud-text" style={FIELD_LABEL}>
                      Out from
                    </label>
                    <input
                      type="date"
                      name="out_from"
                      value={formData.out_from}
                      onChange={handleInputChange}
                      style={INPUT_STYLE}
                    />
                  </div>
                  <div>
                    <label className="cloud-text" style={FIELD_LABEL}>
                      Out through
                    </label>
                    <input
                      type="date"
                      name="out_through"
                      value={formData.out_through}
                      onChange={handleInputChange}
                      style={INPUT_STYLE}
                    />
                  </div>
                </div>
              </Section>

              <Section title="Contact">
                <div
                  className="grid"
                  style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}
                >
                  <div>
                    <label className="cloud-text" style={FIELD_LABEL}>
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="athlete@example.com"
                      style={INPUT_STYLE}
                    />
                  </div>
                  <div>
                    <label className="cloud-text" style={FIELD_LABEL}>
                      Phone
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="(555) 123-4567"
                      style={INPUT_STYLE}
                    />
                  </div>
                </div>
              </Section>

              <Section title="Additional">
                <div>
                  <label className="cloud-text" style={FIELD_LABEL}>
                    Membership no.
                  </label>
                  <input
                    type="number"
                    name="membership_no"
                    value={formData.membership_no}
                    onChange={handleInputChange}
                    placeholder="Enter membership number"
                    style={INPUT_STYLE}
                  />
                </div>

                <div>
                  <label className="cloud-text" style={FIELD_LABEL}>
                    Lifting DB link
                  </label>
                  <input
                    type="url"
                    name="lifting_db_link"
                    value={formData.lifting_db_link}
                    onChange={handleInputChange}
                    placeholder="https://www.liftingdb.com/…"
                    style={INPUT_STYLE}
                  />
                </div>
              </Section>

              {}
              <div
                className="flex"
                style={{
                  gap: 10,
                  paddingTop: 16,
                  borderTop: '1px solid var(--cloud-border)',
                }}
              >
                <Link
                  href="/athletes"
                  style={{ flex: 1, textDecoration: 'none' }}
                >
                  <button
                    type="button"
                    className="cloud-btn cloud-btn-ghost"
                    style={{ width: '100%' }}
                  >
                    Cancel
                  </button>
                </Link>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="cloud-btn cloud-btn-primary"
                  style={{ flex: 1 }}
                >
                  {createMutation.isPending ? 'Creating…' : 'Create athlete'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
