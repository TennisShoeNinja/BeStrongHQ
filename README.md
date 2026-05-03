<div align="center">

# BeStrong HQ

**Coaching infrastructure for powerlifting teams.**

[![CI](https://github.com/TennisShoeNinja/BeStrongHQ/actions/workflows/ci.yml/badge.svg)](https://github.com/TennisShoeNinja/BeStrongHQ/actions/workflows/ci.yml)
![version](https://img.shields.io/badge/version-1.1.0--beta-blue)
![license](https://img.shields.io/badge/license-AGPL--3.0-blue)
![python](https://img.shields.io/badge/python-%3E%3D3.10-3776AB?logo=python&logoColor=white)
![node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)
<br />
![macOS](https://img.shields.io/badge/macOS-000000?logo=apple&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=black)
![Windows](https://img.shields.io/badge/Windows-0078D4?logo=windows&logoColor=white)
![Raspberry Pi](https://img.shields.io/badge/Raspberry_Pi-A22846?logo=raspberrypi&logoColor=white)
<br />
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/TennisShoeNinja)
</div>

<br />

From Google Sheets chaos to structured athlete progression, meet prep, and block planning, in the dashboard coaches will actually love opening. Built by a powerlifting coach, for powerlifting coaches.

<div align="center">
  <img src="docs/preview.png" alt="BeStrong HQ coach dashboard showing the athletes view" />
</div>

## Features

### Spreadsheet Parser
Your Google Sheets become a structured database, automatically. Every set, rep, weight, RPE, accessory movement, primary lift day, and block type (Strength, Peaking, Hypertrophy) gets tagged and indexed. Program number, date range, and theme come straight from the filename. Ready out of the box if you use a 4-day or 5-day template tested with the default parser, or your own format via a [custom parser](docs/custom-parser-guide.md).

### Athlete Management
Full athlete profiles with maxes, weight class, division, federation, contact info, and availability status. Automatic PR tracking with a timeline per lift and bodyweight history. Combine duplicate athletes with a preview so you can see exactly what's getting merged. Archive athletes you're not working with without deleting their data. Pick which columns show on your roster, filter, sort, and export to CSV. Search across athletes and exercises. **Manage exercise variations** so you don't end up with duplicates on your charts. Prescribe "Pause Deadlift" one week and "Pause Deadlift 1-0-0" the next? Tell BeStrong HQ they're the same lift and they plot as one clean line instead of getting split across two entries.

### Training Analytics
- **Estimated 1RM trends** per lift, so you can see exactly how much each block added to their number
- **Weekly volume tracking** across programs, so you can tell who responds to more volume and who doesn't
- **RPE compliance** showing how closely your athletes hit the RPEs you prescribed
- **Primary lift day tagging** so you can tell the app which day is the real squat / bench / deadlift day and the charts track the right session
- **Bodyweight trends** with latest, max, and min
- **Data quality flags** for weird weights, missing bodyweight logs, and sessions the estimator can't read cleanly

### Meet Management
Create meets with dates, federation, location, and LiftingCast links. Assign athletes and see everyone's weeks-out countdown at a glance, color-coded (red inside 4 weeks, orange inside 8, cyan beyond). One page per meet with every athlete entered and where they stand on their prep. Log what they actually hit on meet day, kept separate from their training maxes.

### Coaching Workflow
A **Work Queue** of athletes who need their next program written, driven by your program-due reminders. While you're working an athlete, a panel shows their latest block's results (estimated 1RMs per lift, any PRs hit, how it compared to the block before) alongside a one-click link to their current spreadsheet in a new tab. That way you're writing the next block with their most recent numbers and the source doc both right in front of you. Built-in session timer tracks time per athlete. 15-second undo if you mis-click. One-click buttons to set the next due date (+1 week, +1 month, custom). Inbox for reminders (programs due, meet updates). Add any athlete to the queue manually when you want to work on them outside the schedule. Rolling 30-day stats on how many athletes you've programmed and how long it took.

### Home Dashboard
Everything you need on open:
- **Quick stats:** active athletes, sessions this week, team average score (DOTS / IPF GL), next meet countdown
- **Recent PRs:** a live feed from the last 7 days
- **Upcoming meets:** next 90 days with how many athletes you have entered in each
- **Featured athlete chart:** estimated 1RM squat trend for whoever you pick
- **Weather** for the city you set, so you know what your athletes are training in

### Integrations
- **Sign in with Google:** no separate password to manage, use your existing Google account
- **Google Drive:** sync your athletes' programs straight from Drive, each athlete matched to their folder
- **Google Calendar:** push meets, program-due dates, availability, and birthdays to a dedicated team calendar

### Settings & Customization
- **Team name:** shown on your login page and throughout the app
- **Coach display name:** used in your dashboard greeting
- **Weather location:** drives the weather on your home dashboard
- **Default weight unit:** pick lbs or kg, used everywhere in the app

## Community Edition

Install BeStrong HQ on your own machine. Free forever, community supported.

[Install guide →](docs/install.md)

## How It Works

1. **Connect your Drive.** Point BeStrong HQ at the folder where your athletes' sheets live. OAuth in, done: no file uploads, no drag-and-drop.
2. **Click Sync.** BeStrong HQ parses sets, reps, RPE, accessories, primary lift days: all structured, all queryable.
3. **Review progression.** Your dashboard shows what's trending up, what's stalling, and who's ready to hit a meet PR.

## Hosted Version

Don't want to self-host? [bestronghq.com](https://bestronghq.com) is the managed version of BeStrong HQ. The free version gives you the full self-hosted app, which you can run on your own laptop, desktop, or Raspberry Pi. It only works when your device is on and online. The hosted version is already online, so you can log in from anywhere while we handle the setup and maintenance.

| | Community Edition | Starter ($29/mo) | Pro ($99/mo) |
|---|---|---|---|
| Setup fee | $0 | $99 one-time | $99 one-time |
| Athletes | Unlimited | Up to 15 | Unlimited |
| Coaches | 1 | 1 | Unlimited |
| Access from anywhere | - | ✓ | ✓ |
| Branded subdomain | - | ✓ | ✓ |
| Google Drive sync | When machine on | Always on | Always on |
| Custom parser | DIY (or $150 one-time) | Built for you | Built for you |
| Billing (Stripe, more to come) | - | ✓ | ✓ |
| Revenue tracking | - | ✓ | ✓ |
| Athlete portal (early access) | - | - | ✓ |
| Automatic backups | - | ✓ | ✓ |
| Priority support | Community | Email | Dedicated |

The Starter and Pro setup fee covers the time it takes to build a parser tailored to your spreadsheet format. Subscription is cancelable anytime; the setup fee covers the parser build and is not refundable. Community-edition coaches who'd rather have us build their parser instead of writing it themselves can commission one for $150. See the [custom parser guide](docs/custom-parser-guide.md) for the DIY path.

Hosted adds the operational pieces too: deployment, server uptime, backups, OAuth setup, billing integrations, revenue tracking, and custom parser work. The free version stays free, forever, for coaches who want to run their own setup.

## Contributors

Powerlifting coach who codes? PRs welcome - bug fixes, new parser adapters, install guides, anything. Open an issue first if it's a big change so we can align on direction. For a quick orientation to the codebase, see [Project Structure](docs/project-structure.md) and the [CLI reference](docs/cli.md).

<a href="https://github.com/TennisShoeNinja/BeStrongHQ/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=TennisShoeNinja/BeStrongHQ" alt="Contributors" />
</a>

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).

## Support

If BeStrong HQ saves you time, consider [sponsoring on GitHub](https://github.com/sponsors/TennisShoeNinja). It keeps the free version free and the parser library growing.
