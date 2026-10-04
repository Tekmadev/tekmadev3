import { defineMetaFragment } from "./types";

/**
 * The team slice of GET /meta (the app's src/api/schemas/team.ts
 * `metaFragment`): the role picker and badges, with the help line under each
 * choice. The copy is the owner decision of 2026-10-03 (docs/api-requests/team.md
 * in the app repo), narrowest role first because the add sheet defaults to it.
 * What each role may do is lib/admin-api/permissions.ts.
 */
export const metaFragment = defineMetaFragment(() => ({
  teamRoles: [
    {
      value: "staff",
      label: "Staff",
      help: "Leads and outreach, analytics and onboarding help. Marketing, pricing and coupons are view only. No money.",
      tone: "muted",
    },
    { value: "manager", label: "Manager", help: "Everything except removing team members or making owners.", tone: "neutral" },
    { value: "owner", label: "Owner", help: "Full access, can manage the team.", tone: "gold" },
  ],
}));
