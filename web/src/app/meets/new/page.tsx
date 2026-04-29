'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

import apiClient from '@/lib/api'
import * as Types from '@/lib/types'

const FIELD_LABEL: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  marginBottom: 6,
}

const INPUT_STYLE: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  fontSize: 13,
  borderRadius: 8,
  backgroundColor: 'var(--cloud-surface-raised)',
  border: '1px solid var(--cloud-border)',
  color: 'var(--cloud-text)',
  outline: 'none',
}

export default function NewMeetPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<Types.MeetCreate>({
    name: '',
    federation: 'USAPL',
    meet_date: '',
    meet_date_end: '',
    location: '',
    liftingcast_link: '',
    non_team_athletes: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const createMeetMutation = useMutation({
    mutationFn: (data: Types.MeetCreate) => apiClient.createMeet(data),
    onSuccess: (result) => {
      router.push(`/meets/${result.id}`)
    },
    onError: (error) => {
      console.error('Error creating meet:', error)
      setErrors({ submit: 'Failed to create meet. Please try again.' })
    },
  })

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!formData.name.trim()) {
      newErrors.name = 'Meet name is required'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) {
      return
    }
    createMeetMutation.mutate(formData)
  }

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
          href="/meets"
          className="flex items-center cloud-text-muted"
          style={{
            gap: 4,
            fontSize: 13,
            textDecoration: 'none',
            alignSelf: 'flex-start',
          }}
        >
          <ChevronLeft style={{ width: 14, height: 14 }} />
          Back to Meets
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
            New meet
          </h1>
          <p
            className="cloud-text-muted"
            style={{ fontSize: 13, marginTop: 6 }}
          >
            Create a competition and assign athletes afterwards
          </p>
        </div>

        <div className="cloud-panel" style={{ padding: 24 }}>
          {errors.submit && (
            <div
              style={{
                marginBottom: 20,
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

          <form onSubmit={handleSubmit}>
            <div className="flex flex-col" style={{ gap: 16 }}>
              {}
              <div>
                <label className="cloud-text" style={FIELD_LABEL}>
                  Meet name{' '}
                  <span style={{ color: '#fca5a5', fontWeight: 400 }}>*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g., USAPL Houston Open 2026"
                  style={INPUT_STYLE}
                />
                {errors.name && (
                  <p
                    style={{
                      fontSize: 11,
                      color: '#fca5a5',
                      marginTop: 6,
                    }}
                  >
                    {errors.name}
                  </p>
                )}
              </div>

              {}
              <div>
                <label className="cloud-text" style={FIELD_LABEL}>
                  Federation
                </label>
                <select
                  name="federation"
                  value={formData.federation ?? ''}
                  onChange={handleChange}
                  style={INPUT_STYLE}
                >
                  <option value="USAPL">USAPL</option>
                  <option value="PA/IPF">PA/IPF</option>
                  <option value="USPA">USPA</option>
                </select>
              </div>

              {}
              <div
                className="grid"
                style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}
              >
                <div>
                  <label className="cloud-text" style={FIELD_LABEL}>
                    Meet date
                  </label>
                  <input
                    type="date"
                    name="meet_date"
                    value={formData.meet_date ?? ''}
                    onChange={handleChange}
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <label className="cloud-text" style={FIELD_LABEL}>
                    End date{' '}
                    <span
                      className="cloud-text-muted"
                      style={{ fontSize: 11, fontWeight: 400 }}
                    >
                      (multi-day)
                    </span>
                  </label>
                  <input
                    type="date"
                    name="meet_date_end"
                    value={formData.meet_date_end ?? ''}
                    onChange={handleChange}
                    style={INPUT_STYLE}
                  />
                </div>
              </div>

              {}
              <div>
                <label className="cloud-text" style={FIELD_LABEL}>
                  Location
                </label>
                <input
                  type="text"
                  name="location"
                  value={formData.location ?? ''}
                  onChange={handleChange}
                  placeholder="e.g., Houston, TX"
                  style={INPUT_STYLE}
                />
              </div>

              {}
              <div>
                <label className="cloud-text" style={FIELD_LABEL}>
                  LiftingCast link
                </label>
                <input
                  type="text"
                  name="liftingcast_link"
                  value={formData.liftingcast_link ?? ''}
                  onChange={handleChange}
                  placeholder="https://liftingcast.com/…"
                  style={INPUT_STYLE}
                />
              </div>

              {}
              <div>
                <label className="cloud-text" style={FIELD_LABEL}>
                  Non-team athletes
                </label>
                <input
                  type="text"
                  name="non_team_athletes"
                  value={formData.non_team_athletes ?? ''}
                  onChange={handleChange}
                  placeholder="Names or notes"
                  style={INPUT_STYLE}
                />
              </div>

              {}
              <div
                className="flex"
                style={{
                  gap: 10,
                  paddingTop: 10,
                }}
              >
                <button
                  type="submit"
                  disabled={createMeetMutation.isPending}
                  className="cloud-btn cloud-btn-primary"
                >
                  {createMeetMutation.isPending
                    ? 'Creating…'
                    : 'Create meet'}
                </button>
                <Link href="/meets" style={{ textDecoration: 'none' }}>
                  <button
                    type="button"
                    className="cloud-btn cloud-btn-ghost"
                  >
                    Cancel
                  </button>
                </Link>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
