# Contributing

Thanks for your interest in BeStrong HQ. The project is early and moves fast, so the best way to contribute right now is feedback and bug reports.

## Reporting bugs or sharing ideas

The quickest path is the in-app feedback button (question mark icon, top right), which opens pre-filled issue templates. You can also file directly on GitHub:

- [Bug report](https://github.com/TennisShoeNinja/BeStrongHQ/issues/new?template=bug_report.yml)
- [Feedback or feature idea](https://github.com/TennisShoeNinja/BeStrongHQ/issues/new?template=feedback.yml)
- [Browse existing issues](https://github.com/TennisShoeNinja/BeStrongHQ/issues) before filing to avoid duplicates

Good bug reports include: steps to reproduce, what you expected, what you saw, and a screenshot if the UI is involved. The issue templates guide you through it.

## Running locally

Day-to-day development runs on your host (faster than rebuilding Docker on every change):

1. `git clone https://github.com/TennisShoeNinja/BeStrongHQ.git && cd BeStrongHQ`
2. `python3 -m pip install -e .`  (Python 3.10+ required)
3. `cd web && npm install && cd ..`  (Node 20+ required)
4. `bestrong run` — opens API on 8080, UI on 3000

Docker is the *user* install path (see [docs/install.md](docs/install.md)), not the dev workflow.

## Code contributions

Pull requests are welcome, but please open an issue first so we can discuss scope before you spend time on it. This saves everyone from rework when a change needs to go a different direction.

A few conventions:

- Python code goes through `ruff check bestrong/`
- Frontend code goes through `npm run lint` and `npm run typecheck` inside `web/`
- Database schema changes need a matching migration in `bestrong/models/database.py`
- Keep commits focused, one concern per commit where practical

## Getting listed in [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md)

Every reporter, tester, and contributor who shapes a release is credited. You can include a credit name in the feedback dialog, or mention how you'd like to be listed when you open an issue. Anonymous is also fine.

## Code of conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Be decent to each other.

