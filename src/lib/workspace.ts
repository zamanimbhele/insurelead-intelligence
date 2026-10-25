// Workspace types (individual advisors plan, phase 2). An organisation is
// always the account boundary; the type only changes what people see -
// wording and which team features appear - never what they may access.
export const WORKSPACE_TYPES = ["individual", "practice", "brokerage"] as const;
export type WorkspaceType = (typeof WORKSPACE_TYPES)[number];

export function normaliseWorkspaceType(value: unknown): WorkspaceType {
  return (WORKSPACE_TYPES as readonly unknown[]).includes(value) ? (value as WorkspaceType) : "brokerage";
}

export const WORKSPACE_TYPE_LABELS: Record<WorkspaceType, string> = {
  individual: "Individual",
  practice: "Practice",
  brokerage: "Brokerage",
};

export type WorkspaceTerms = {
  // Sidebar link and page heading for the organisation's own settings.
  profileTitle: string;
  // "your practice", "your brokerage": used inside sentences.
  organisationNoun: string;
  // Whether the team section shows by default (an individual sees it
  // only once they choose to invite someone).
  showTeam: boolean;
};

export function workspaceTerms(type: WorkspaceType | undefined): WorkspaceTerms {
  switch (type) {
    case "individual":
      return { profileTitle: "My practice", organisationNoun: "your practice", showTeam: false };
    case "practice":
      return { profileTitle: "Practice profile", organisationNoun: "your practice", showTeam: true };
    default:
      return { profileTitle: "Broker Profile", organisationNoun: "your brokerage", showTeam: true };
  }
}

// Signup: what the person is asked to name, per workspace type.
export const SIGNUP_CHOICES: { value: WorkspaceType; title: string; description: string }[] = [
  { value: "individual", title: "Just me", description: "An independent advisor or broker working on your own." },
  { value: "practice", title: "A small practice", description: "A few advisors or staff working together." },
  { value: "brokerage", title: "A brokerage", description: "An established brokerage with a team." },
];
