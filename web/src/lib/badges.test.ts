import { describe, expect, it } from 'vitest';
import { evaluateBadges } from './badges';
import type { PREventEntry } from './types';

function prEvent(
  programId: number,
  programNumber: number,
  variation: string,
  recordedAt: string,
  options: Partial<PREventEntry> = {},
): PREventEntry {
  return {
    variation,
    variation_canon: variation.toLowerCase(),
    is_competition: true,
    program_id: programId,
    program_number: programNumber,
    program_name: `Program ${programId}`,
    e1rm: 400,
    prev_best_e1rm: 390,
    delta: 10,
    recorded_at: recordedAt,
    ...options,
  };
}

describe('PR event badges', () => {
  it('counts competition PR events only', () => {
    const badges = evaluateBadges({
      meetResults: [],
      prEvents: [
        prEvent(101, 1, 'Competition Squat', '2026-01-01'),
        prEvent(205, 2, 'Competition Bench', '2026-02-01'),
        prEvent(309, 3, 'Competition Deadlift', '2026-03-01'),
        ...Array.from({ length: 7 }, (_, i) =>
          prEvent(400 + i, 4 + i, `Close Grip Bench ${i}`, `2026-04-0${i + 1}`, {
            is_competition: false,
          }),
        ),
      ],
    });

    expect(badges.some((badge) => badge.id === 'pr-count-3')).toBe(true);
    expect(badges.some((badge) => badge.id === 'pr-count-10')).toBe(false);
    expect(badges.some((badge) => badge.id === 'pr-count-100')).toBe(false);
  });

  it('ignores variation events below the first PR count tier', () => {
    const badges = evaluateBadges({
      meetResults: [],
      prEvents: [
        prEvent(101, 1, 'Competition Squat', '2026-01-01'),
        prEvent(205, 2, 'Competition Bench', '2026-02-01'),
        prEvent(309, 3, 'Close Grip Bench', '2026-03-01', {
          is_competition: false,
        }),
      ],
    });

    expect(badges.some((badge) => badge.id === 'pr-count-3')).toBe(false);
  });

  it('requires consecutive program numbers for PR streak badges', () => {
    const badges = evaluateBadges({
      meetResults: [],
      prEvents: [
        prEvent(101, 10, 'Competition Squat', '2026-01-01'),
        prEvent(205, 11, 'Competition Bench', '2026-02-01'),
        prEvent(309, 12, 'Close Grip Bench', '2026-03-01', {
          is_competition: false,
        }),
        prEvent(411, 13, 'Competition Deadlift', '2026-04-01'),
        prEvent(512, 14, 'Competition Squat', '2026-05-01'),
        prEvent(620, 15, 'Competition Bench', '2026-06-01'),
      ],
    });

    expect(badges.some((badge) => badge.id === 'pr-streak-3')).toBe(true);
    expect(badges.some((badge) => badge.id === 'pr-streak-5')).toBe(false);
  });

  it('uses squat bench and deadlift competition PR events for Triple Threat', () => {
    const badges = evaluateBadges({
      meetResults: [],
      prEvents: [
        prEvent(101, 1, 'Competition Squat', '2026-01-01'),
        prEvent(205, 2, 'Competition Bench', '2026-01-20'),
        prEvent(309, 3, 'Competition Deadlift', '2026-03-15'),
      ],
    });

    const tripleThreat = badges.find((badge) => badge.id === 'triple-threat');
    expect(tripleThreat).toBeDefined();
    expect(tripleThreat?.events[0].meet_date).toBe('2026-03-15');
  });

  it('uses competition PR event delta only for Big Jump', () => {
    const badges = evaluateBadges({
      meetResults: [],
      prEvents: [
        prEvent(101, 1, 'Close Grip Bench', '2026-01-01', {
          is_competition: false,
          delta: 25,
          prev_best_e1rm: 300,
          e1rm: 325,
        }),
        prEvent(205, 2, 'Competition Bench', '2026-02-01', {
          delta: 30,
          prev_best_e1rm: 320,
          e1rm: 350,
        }),
      ],
    });

    const bigJump = badges.find((badge) => badge.id === 'big-jump');
    expect(bigJump).toBeDefined();
    expect(bigJump?.count).toBe(1);
    expect(bigJump?.events[0].detail).toBe('+30 lbs (320 to 350)');
  });
});
