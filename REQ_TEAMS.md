# Team Collaboration Requirements

**Status:** Implemented first-release baseline; hosted migrations and authorization smoke checks complete

The implementation covers the first-release scope below. Migrations through
`202609250007` are deployed to the linked Supabase project, and hosted RLS,
anonymous-access, grant, trigger, and security-advisor checks pass. Authenticated
username claiming now passes in a signed-in browser session. Invitation,
role-management, and live-sharing browser flows still require acceptance coverage.

This document defines optional team collaboration for VeloTerra. Teams let riders
work toward shared exploration goals while keeping individual rides, routes, wallet
balances, and rewards private by default.

The current local-first behavior remains important: riding and personal exploration
must continue without an account or network connection. Team features require a
signed-in account for membership, authorization, and synchronization.

## Product Intent

- Give riders a durable shared map for a team.
- Make the boundary between shared exploration and private activity obvious.
- Allow lightweight coordination without turning individual rides or wallets into a
  social feed.
- Preserve the existing personal map, ride history, and wallet as the user's own data.

## Confirmed Direction

- A team has at least a **Name**, **Description**, and **Logo**.
- The initial roles are **Captain**, **Officer**, and **Member**.
- The Captain is the team administrator.
- Officers can invite members, but cannot delete the team.
- Members can recommend prospective members to someone with invite permission.
- Explored World can switch between a personal view and a team view.
- Joining a team must clearly disclose that explored tiles will be shared with the team.
- Individual rides and wallet data are not shared with the team.
- Ride view has an explicit control for sharing the rider's current position with team
  members. It is hidden by default.

## User Identity And Profiles

Supabase `auth.users.id` is the canonical unique identifier for authorization and
data ownership. It must remain internal; users should not need to know or exchange a
UUID. A Google email is an authentication and recovery attribute, not a good team
identifier, and a Google display name is neither unique nor guaranteed to remain
stable.

The recommended user-facing identity has three separate parts:

- **Username:** a user-chosen, globally unique handle used to find people for team
  invitations and recommendations. Display it as `@username`. A Google-derived name
  is only a suggestion and is not the username until the user explicitly claims it.
- **Display name:** an editable, non-unique name shown in member lists and live
  position markers. Google `full_name` or `name` can provide the initial value only.
- **Email:** retained for authentication and account recovery; do not use it for team
  discovery or show it to other team members by default.

### Identity requirements

**USER-01: Claim a unique username**

- A signed-in user can claim a username before creating or joining a team.
- After Google sign-in, Settings shows a **Profile** section inside the Account card.
  It contains the display name, avatar, email status, and username state.
- If no username exists, the Profile section shows **Choose username**. The same
  form is shown before the first team action that requires an identity.
- The form provides an available-handle check, validation feedback, and an explicit
  **Save username** action; typing a suggestion alone does not claim it.
- Google `full_name` or `name` may prefill the suggestion, but it is not stored as the
  username until the user confirms it.
- Usernames are unique across VeloTerra using case-insensitive comparison and a
  normalized value. `BikeRider`, `bikerider`, and `BIKERIDER` therefore cannot be
  separate accounts.
- Recommended initial validation: 3-24 characters, letters, numbers, underscore, and
  hyphen only; no leading or trailing separator; a reserved-name list blocks
  misleading or system names.
- Availability checks and the final database constraint must both be enforced; the
  database is authoritative under concurrent claims.
- Existing Google accounts without a username must be prompted to claim one before
  team participation. Signing in and personal play remain possible without one.

**USER-02: Use the right identity in each context**

- Backend authorization, membership, invitations, recommendations, and ownership use
  the immutable Supabase user ID.
- Team member lists show `Display Name (@username)` so duplicate display names are
  understandable without exposing email addresses.
- Team invitations and recommendations target an exact username, then store the
  resolved user ID. The claimed username is final, while memberships and pending
  invitations remain attached to the immutable user ID.
- Live-position markers use the display name and username, never the email address.

**USER-03: Manage profile changes**

- The user can edit display name and avatar independently of the Google account.
- Once claimed, the username is final for the lifetime of the account and is read-only
  in Settings > Account > Profile.
- There is no username rename flow. Display name and avatar are the editable profile
  fields for correcting presentation or reflecting a changed identity.
- A claimed username must not be recycled for another account, reducing impersonation
  and recognition risks.
- Profile setup and display-name changes must not silently change team membership or
  sharing consent.

**USER-04: Keep identity discovery private**

- Username lookup is available only to authenticated users and only for the exact
  lookup needed by team invitation or recommendation flows.
- There is no public user directory in the first version.
- Do not support email-based team discovery in the first version. Email invitations
  can be reconsidered later with explicit consent and abuse controls.

## Roles And Permissions

The first version should use fixed roles with server-enforced permissions. The data
model should still represent permissions separately enough that custom roles are not
blocked later.

| Capability | Captain | Officer | Member |
|---|---:|---:|---:|
| View the team's explored map | Yes | Yes | Yes |
| Contribute explored tiles | Yes | Yes | Yes |
| Recommend a prospective member | Yes | Yes | Yes |
| Invite a member directly | Yes | Yes | No |
| Review or act on recommendations | Yes | Yes | No |
| Edit team name, description, or logo | Yes | No | No |
| Change member roles | Yes | No | No |
| Kick a member | Yes | No by default | No |
| Delete the team | Yes | No | No |
| Transfer Captain role | Yes | No | No |

A recommendation is not an invitation. A Captain or Officer must explicitly approve
it and send an invitation, or decline it.

### Role invariants

- A team has exactly one Captain in the initial version.
- The Captain cannot demote or remove the only Captain without first transferring
  the role or deleting the team.
- A user must accept an invitation before becoming an active member.
- Role and membership checks are enforced by the backend, not only by UI controls.
- The default policy is Captain-only kicking. Whether an Officer can kick members can
  be enabled later as a separately reviewed permission.

## Functional Requirements

### Team lifecycle

**TEAM-01: Create a team**

- A signed-in user can create a team.
- The creator becomes the Captain.
- Creation requires a non-empty name and stores the description and logo, using a
  generated placeholder when no logo is supplied.
- The team name and logo must be validated for length, type, and size before storage.

**TEAM-02: Edit team details**

- The Captain can update the name, description, and logo.
- Existing members see the updated details after synchronization.
- Replacing a logo must not leave an inaccessible or orphaned asset behind.

**TEAM-03: Delete a team**

- Only the Captain can delete a team.
- Deletion requires a clear confirmation that team membership, invitations,
  recommendations, shared exploration records, and live-presence data will be removed.
- Deleting a team does not delete a member's personal rides, wallet, or personal
  explored cells.
- The UI must distinguish deleting a team from leaving a team.

**TEAM-04: Leave a team**

- A member can leave a team without deleting personal data.
- The only Captain cannot leave until Captain is transferred or the team is deleted.
- The leave flow must explain what happens to the member's previously contributed
  shared tiles. Recommended default: explored tiles will not be visible to the team anymore (unless of course other members have explored the tiles); personal data remains untouched.

### Membership and invitations

**TEAM-05: Invite a member**

- The Captain or Officer can invite an existing VeloTerra user by exact username
  through an explicit invitation flow.
- Once the username is resolved, the invitation is linked to the immutable user ID;
  changing the username does not redirect or invalidate the invitation.
- Invitations have a pending, accepted, declined, expired, or revoked state.
- An invitation must identify the team and show the sharing disclosure before it can
  be accepted.
- Recommended default: invitations expire after 7 days and can be revoked by the
  Captain or an Officer.
- The invite flow must not reveal a user's email or profile information to unrelated
  team members.

**TEAM-06: Recommend a member**

- Any active team member can recommend a prospective member.
- Recommendations target an exact username rather than an email address.
- A recommendation is visible only to the team members with invite permission.
- A recommendation can include an optional note and must have a clear status so it
  cannot be accidentally invited twice.
- The recommender can see whether the recommendation is pending, invited, declined,
  or dismissed, without seeing private moderation notes.

**TEAM-07: Manage members and roles**

- The Captain can promote a Member to Officer, demote an Officer to Member, and
  transfer Captain to another active member.
- The Captain can kick a member with a confirmation step.
- Kicking immediately revokes team access and pending team invitations, but does not
  delete personal data.
- The removed member's contributed shared tiles follow TEAM-04: they leave the team view
  unless another active member has contributed the same tile.
- A removed member must not receive future team map updates or live positions.
- Membership changes should be recorded in a minimal team audit history for the
  Captain and Officers.

### Shared exploration

**TEAM-08: Personal and team map views**

- Explored World provides a clear switch between **Personal** and **Team** views.
- Personal view shows only the user's personal explored cells.
- Team view shows the union of the selected team's shared cells contributed by active
  members. A tile previously contributed by a member who leaves or is removed remains
  visible only if another active member has contributed the same tile.
- If a user belongs to multiple teams, the user chooses which team's view to open.
- Team view must not expose ride paths, ride timestamps, wallet balances, or reward
  amounts.
- A team tile should not reveal which member discovered it unless attribution is
  explicitly enabled as a future opt-in feature.

**TEAM-09: Share explored tiles on join**

- Before accepting an invitation, the user must see a plain-language disclosure that
  their explored tiles will be shared with the team.
- The disclosure must state that individual rides and wallet data remain private.
- The user must explicitly accept the sharing terms before membership becomes active.
- Recommended default: the user's existing explored cells and future accepted cells
  contribute to the team's shared tile set. This exact historical scope must remain
  visible in the consent text.
- Joining a team must not silently publish ride paths or retroactively publish wallet
  activity.

**TEAM-10: Team exploration synchronization**

- Accepted exploration contributions synchronize as tile identifiers and the minimum
  metadata needed to render the team map.
- A ride can continue while offline. Personal exploration and ride recording remain
  available; team contributions wait in a local outbox and show a pending-sync state.
- Synchronization is monotonic for each active member contribution: merging contributions
  cannot remove a tile contributed by an active member. A departure or removal may remove
  that member's contribution from the team view under TEAM-04, but never removes personal
  exploration data.
- A team view shows the last synchronized state when offline and clearly indicates
  that it may be stale.
- Team exploration records must be protected by team membership authorization and
  database row-level security.

### Live ride visibility

**TEAM-11: Share current position with the team**

- Ride view includes an explicit toggle labelled with the privacy consequence, such as
  `Share my live position with this team`.
- The default is off for every ride and every team.
- When enabled, only the current position of the active rider is visible to current
  members of the selected team.
- Sharing current position must not share the ride route, ride history, distance,
  speed, duration, wallet, or rewards.
- Position sharing stops automatically when the ride is finished, the rider signs out,
  leaves or is removed from the team, or the position expires.
- The server must apply a short expiry to live positions so a crashed or disconnected
  client cannot remain visible indefinitely.
- The UI must show when the position is being shared and which team can see it.
- A user can stop sharing immediately from ride view.
- Recommended default: do not remember the toggle between rides. Requiring a fresh
  opt-in prevents an old ride setting from unexpectedly exposing a later ride.

## Privacy And Security Requirements

- Teams are private by default; there is no public team directory in the first version.
- Team membership, invitations, recommendations, shared cells, and live positions are
  separate authorization domains.
- The client must never contain a privileged Supabase credential.
- All team data access must be scoped to the authenticated user and active team
  membership through database row-level security.
- Shared cell identifiers are still sensitive location data. They must not be exposed
  to non-members or included in public URLs without an explicit future decision.
- Live positions should be transmitted only while enabled, should be rate-limited, and
  should not be retained as a historical track.
- Team members must be able to see who currently has live sharing enabled, without
  implying that hidden members are absent from the ride.
- Kicked, departed, or expired members lose access promptly, including access from
  previously cached team responses where practical.
- Account deletion and team deletion must define cleanup of memberships, invitations,
  recommendations, shared cells, logos, and live-presence records.
- The UI must use the same privacy language at invitation acceptance, team switching,
  and live-sharing changes; no important sharing behavior should be hidden in a tooltip.

## Suggested User Flows

### Create and invite

1. The user selects **Create team** and enters a name, description, and logo.
2. The creator becomes Captain and sees the member-management screen.
3. The Captain or Officer invites a user, or a member submits a recommendation.
4. The invitee sees the team details and the shared-exploration disclosure.
5. The invitee accepts or declines; acceptance creates active membership.

### Set up identity

1. The user signs in with Google and opens Settings.
2. Account > Profile offers a suggested username when one has not been claimed.
3. The user edits or accepts the suggestion, checks availability, and saves it.
4. After saving, the username is shown as read-only in the Profile section.
5. The user can later edit the display name or avatar without changing the username.

### Join and explore

1. The user reads the disclosure before joining.
2. The app explains that explored tiles are shared with the team.
3. The app separately confirms that rides, routes, wallet, and rewards remain private.
4. Explored World offers Personal and Team views after joining.
5. Offline rides continue locally and synchronize team tile contributions later.

### Share a live position

1. The rider starts or resumes a ride with live sharing off.
2. The rider chooses a team and turns on the live-position toggle.
3. The ride view shows an active sharing indicator and the selected team.
4. Team members see a temporary current-position marker, not a route history.
5. Sharing ends automatically when the ride ends or the expiry is reached.

## Data Concepts

The implementation should keep team collaboration separate from personal ride and
wallet records. A likely first model contains:

- **Team:** id, name, description, logo reference, Captain, created/updated timestamps,
  and lifecycle state.
- **Profile:** user ID, unique normalized username, display name, optional avatar, and
  timestamps. The username is for discovery; the user ID remains the authorization
  key.
- **Team membership:** team, user, role, status, joined time, and removal time.
- **Invitation:** team, invitee, inviter, expiry, status, and timestamps.
- **Recommendation:** team, recommender, prospective member, note, reviewer, status,
  and timestamps.
- **Team explored cell contribution:** team, cell identifier, contributing user, first
  contribution time, and minimum synchronization metadata. The visible team map is
  derived from contributions by active members; do not store a ride path here.
- **Live presence:** team, user, current position, last update, expiry, and sharing
  status. Do not use it as a ride-history table.
- **Team audit event:** actor, event type, affected user or object, and timestamp,
  with no unnecessary location or wallet data.

## Acceptance Criteria For A First Release

- A signed-in user can create a team with a name, description, and logo.
- A signed-in user can claim a unique username and sees display name plus `@username`
  wherever team identity is shown.
- A signed-in user can claim one username from Settings > Account > Profile; afterward
  the username is visible there as read-only while display name and avatar remain
  editable.
- The creator is Captain; Officers can invite; Members can recommend; only the Captain
  can delete the team and change roles.
- A member can be invited, accept after seeing the sharing disclosure, and leave or be
  kicked without losing personal rides, wallet, or personal cells.
- Explored World can switch between personal cells and the selected team's union of
  shared cells.
- Existing and newly explored cells follow the exact scope stated in the join
  disclosure.
- Individual ride details, route history, and wallet balances remain unavailable to
  other team members.
- Live position sharing is off by default, requires an explicit toggle, is visible to
  the selected team only, and expires when the ride ends or the presence times out.
- Offline riding still works, with team contributions queued and surfaced as pending
  until synchronization succeeds.
- Backend authorization tests prevent non-members from reading team data and prevent
  Members or Officers from performing Captain-only actions.
- Deleting a team or leaving it does not delete personal data.

## Additional Ideas

These are deliberately optional and should follow the privacy rules above:

- **Team expeditions:** shared tile targets for a region, route, or landmark restoration
  project. Reward progress can be team-level without exposing anyone's wallet.
- **Team milestones:** celebrate first shared district, total unique cells, or a fully
  explored region. Keep attribution opt-in and aggregate by default.
- **Team map notes:** members can pin a meeting point, hazard, repair shop, or route
  suggestion with moderation and removal controls.
- **Expiring meet-up beacon:** a separately consented, short-lived marker for a planned
  ride. It should never reuse the live-position stream implicitly.
- **Contribution history:** an opt-in personal view showing which tiles the user added,
  while the team map remains unattributed by default.
- **Team challenges:** time-boxed exploration goals with progress based on shared cells,
  not coin balances or individual performance.
- **Captain announcements:** a small team-only message or pinned plan, with reporting
  and moderation controls before free-form chat is introduced.
- **Team-specific offline regions:** members can suggest or share named offline areas,
  while each device chooses what it actually downloads.

## Open Decisions

1. Can a user belong to multiple teams at once? Recommended default: yes, with one
   selected team at a time for team view and live sharing.
2. Should historical personal cells be contributed on join, or only cells explored after
   joining? The recommended default is historical plus future cells, with explicit
   consent.
3. What is the maximum team size, and is it different for free or future paid plans?
4. Should Officers be allowed to kick members, or only invite and review recommendations?
5. What logo formats, storage limits, and moderation rules are acceptable?
6. How precise and how frequently should live positions be updated?
7. Should a user be able to hide live position from a particular member, or only from the
   the whole team?
8. Should team map tiles show discovery dates or remain tile-only?
9. What notifications are needed for invitations, recommendations, role changes, and
    team removal?
10. Should a team have an archive mode instead of immediate deletion?
11. Should email invitations for users who have not registered be supported later?
12. What export and deletion guarantees are required for team data under account removal?

## Related Documentation

- [Project plan](PLAN.md) for future requirements and unresolved product questions.
- [Architecture overview](Architecture/README.md) for current system boundaries and
  local-first constraints.
