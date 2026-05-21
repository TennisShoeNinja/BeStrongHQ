'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ChevronLeft, Users } from 'lucide-react'
import Link from 'next/link'

import apiClient from '@/lib/api'
import * as Types from '@/lib/types'
import { EmptyState } from '@/components/empty-state'

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
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<Set<number>>(
    new Set()
  )

  const {
    data: athletes = [],
    isLoading: athletesLoading,
    isError: athletesError,
  } = useQuery({
    queryKey: ['athletes-list'],
    queryFn: () => apiClient.listAthletes(false),
  })

  // Create the meet, then assign any selected athletes through the same
  // assign endpoint the detail page uses. If the meet is created but one or
  // more assignments fail, we keep the meet and still navigate to it so the
  // coach can finish on the detail page rather than losing their work.
  const createMeetMutation = useMutation({
    mutationFn: async (data: Types.MeetCreate) => {
      const meet = await apiClient.createMeet(data)
      const ids = Array.from(selectedAthleteIds)
      const results = await Promise.allSettled(
        ids.map((id) => apiClient.assignAthleteToMeet(meet.id, id))
      )
      const failedCount = results.filter(
        (r) => r.status === 'rejected'
      ).length
      return { meet, attempted: ids.length, failedCount }
    },
    onSuccess: ({ meet, failedCount }) => {
      if (failedCount > 0) {
        // Surface the partial failure, then still route to the new meet.
        const noun = failedCount === 1 ? 'athlete' : 'athletes'
        router.push(
          `/meets/${meet.id}?assign_error=${failedCount}&assign_noun=${noun}`
        )
      } else {
        router.push(`/meets/${meet.id}`)
      }
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

  const toggleAthlete = (id: number) => {
    setSelectedAthleteIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
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

  const selectedCount = selectedAthleteIds.size
  const submitLabel = createMeetMutation.isPending
    ? 'Creating…'
    : selectedCount > 0
    ? `Create meet with ${selectedCount} athlete${
        selectedCount > 1 ? 's' : ''
      }`
    : 'Create meet'

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
            Create a competition and assign athletes now or later
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
              <div>
                <label
                  className="cloud-text"
                  style={{ ...FIELD_LABEL, marginBottom: 8 }}
                >
                  Competing athletes{' '}
                  <span
                    className="cloud-text-muted"
                    style={{ fontSize: 11, fontWeight: 400 }}
                  >
                    (optional)
                  </span>
                </label>

                {athletesLoading ? (
                  <div
                    className="cloud-text-muted"
                    style={{
                      fontSize: 13,
                      padding: '8px 12px',
                    }}
                  >
                    Loading athletes…
                  </div>
                ) : athletesError ? (
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
                    Couldn&rsquo;t load athletes. You can still create the meet
                    and assign athletes afterwards.
                  </div>
                ) : athletes.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    iconTone="muted"
                    body="No athletes yet. You can assign athletes after the meet is created."
                    compact
                  />
                ) : (
                  <div
                    className="cloud-thin-scroll"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      maxHeight: 240,
                      overflowY: 'auto',
                      borderRadius: 8,
                      border: '1px solid var(--cloud-border)',
                      backgroundColor: 'var(--cloud-surface-raised)',
                      padding: 4,
                    }}
                  >
                    {athletes.map((athlete) => {
                      const checked = selectedAthleteIds.has(athlete.id)
                      return (
                        <label
                          key={athlete.id}
                          className="flex items-center"
                          style={{
                            padding: '8px 12px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            backgroundColor: checked
                              ? 'rgba(12, 92, 171, 0.12)'
                              : 'transparent',
                            gap: 12,
                            transition: 'background-color 120ms ease',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAthlete(athlete.id)}
                            style={{
                              accentColor: 'var(--cloud-primary)',
                              width: 14,
                              height: 14,
                            }}
                          />
                          <span
                            className="cloud-text"
                            style={{ fontSize: 13 }}
                          >
                            {athlete.name}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {selectedCount > 0 && (
                  <p
                    className="cloud-text-muted"
                    style={{ fontSize: 11, marginTop: 8 }}
                  >
                    {selectedCount} athlete{selectedCount > 1 ? 's' : ''}{' '}
                    selected
                  </p>
                )}
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
                  {submitLabel}
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
