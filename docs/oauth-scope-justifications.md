---
project: BeStrong HQ Login
purpose: Per-scope justifications for Google OAuth verification submission
---

# OAuth Scope Justifications: BeStrong HQ Login

> **Self-hosting?** This file is the justification text submitted for the hosted BeStrong HQ deployment. If you're verifying your own Google Cloud project, copy these as a starting point and adapt the wording to your setup (project name, how you describe your team, whether you're splitting login and Drive across separate projects, etc).

BeStrong HQ is a powerlifting coaching analytics platform used by coaches to manage athlete profiles and review training data. This Google Cloud project (BeStrong HQ Login) handles user sign-in only. Drive access is handled by a separate project (BeStrong HQ Drive) under its own verification.

## openid

BeStrong HQ uses OpenID Connect as the authentication mechanism for coaches signing in to the platform. The `openid` scope is required to receive the ID token that confirms the user has authenticated with Google and to obtain the stable subject identifier we use as the primary key for the user's account record. Without this scope we cannot establish a verified login session.

## https://www.googleapis.com/auth/userinfo.email

We use the user's email address as the unique account identifier in BeStrong HQ. The email is matched against the email on file for the coach's account, which is how we route them to the correct data after sign-in. It is also used for transactional account notifications and is never shared with third parties or used for marketing.

## https://www.googleapis.com/auth/userinfo.profile

We use the user's name and profile picture to populate the coach's display name and avatar in the BeStrong HQ interface, so athletes and other coaches on the same coaching team can identify who made a given change or comment. This avoids requiring the coach to manually fill in basic profile fields after signing in. The data is stored on the coach's own user record and is not shared externally.
