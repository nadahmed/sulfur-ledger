export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    "read:accounts", "manage:accounts",
    "read:journals", "create:journals", "update:journals", "delete:journals",
    "read:tags", "manage:tags",
    "read:reports",
    "read:organization", "manage:organization"
  ],
  member: [
    "read:accounts", "manage:accounts",
    "read:journals", "create:journals", "update:journals", "delete:journals",
    "read:tags", "manage:tags",
    "read:reports",
    "read:organization"
  ],
  viewer: [
    "read:accounts", 
    "read:journals", 
    "read:tags",
    "read:reports",
    "read:organization"
  ]
};
