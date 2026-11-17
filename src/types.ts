export type AuditStatus = "pass" | "warn" | "fail" | "unknown";
export type RosterStatus = "completed" | "no_show" | "abandoned" | "unknown";

export interface CapturedPage {
  url: string;
  finalUrl: string;
  title: string;
  httpStatus: number | null;
  capturedAt: string;
  screenshotPath: string;
  htmlPath: string;
  textPath: string;
  text: string;
  error?: string;
}

export interface LinkCheck {
  label: string;
  url: string;
  status: AuditStatus;
  httpStatus: number | null;
  finalUrl: string;
  reason: string;
  checkedAt: string;
  screenshotPath?: string;
  textPath?: string;
}

export interface ProjectEvidence {
  name: string;
  summary: string;
  details: string;
  nasaData: string;
  demoUrl: string | null;
  projectUrl: string | null;
  submitted: boolean;
}

export interface ChallengeEvidence {
  title: string;
  url: string | null;
  excerpt: string;
  page?: CapturedPage;
}

export interface AuditFinding {
  code: string;
  severity: "info" | "warning" | "error";
  status: AuditStatus;
  message: string;
  evidence: string[];
}

export interface TeamAudit {
  name: string;
  slug: string;
  url: string;
  location: string;
  members: string[];
  about: string;
  pages: Record<string, CapturedPage>;
  project: ProjectEvidence;
  challenge: ChallengeEvidence;
  links: LinkCheck[];
  challengeCoverage: {
    status: AuditStatus;
    ratio: number | null;
    matchedTerms: string[];
    missingTerms: string[];
    explanation: string;
  };
  findings: AuditFinding[];
  status: AuditStatus;
}

export interface RosterEntry {
  name: string;
  url: string | null;
  challenge: string;
  status: RosterStatus;
  audited: boolean;
}

export interface RosterEvidence {
  sourceUrl: string;
  page: CapturedPage;
  teams: RosterEntry[];
  registered: number;
  completed: number;
  noShow: number;
  abandoned: number;
  unknown: number;
}

export interface EventAudit {
  schemaVersion: "1.0";
  toolVersion: string;
  startedAt: string;
  completedAt: string;
  sourceUrl: string;
  event: {
    name: string;
    country: string;
    year: string;
    slug: string;
    pages: Record<string, CapturedPage>;
  };
  teams: TeamAudit[];
  roster?: RosterEvidence;
  summary: {
    totalTeams: number;
    pass: number;
    warn: number;
    fail: number;
    unknown: number;
    findings: number;
  };
  limitations: string[];
}

export interface AuditOptions {
  outputDir: string;
  timeoutMs: number;
  concurrency: number;
  checkExternalLinks: boolean;
  maxTeams?: number;
  headed: boolean;
  rosterUrl?: string;
}
