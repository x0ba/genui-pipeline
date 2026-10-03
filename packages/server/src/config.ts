import type {
  Builder,
  ComponentDef,
  Decider,
  DesignContract,
  FixtureSet,
  KitConfig,
  PromptSettings,
  RegionConfig,
  Thresholds,
  Tool,
  Verifier,
} from "@malleable/core";
import type { Storage } from "./storage";

/** What the app tells the library about one person. Everything here is shown to the builder. */
export type UserDescription = {
  /** One of the app's audiences. Leave it out in apps with one audience. */
  audience?: string;
  name?: string;
  /** What the person says they need, in their words. The gate reads it. */
  needs?: string;
  /** How they actually use the app. The gate reads it. */
  signals?: string | string[];
  /** The fixture whose data stands in for this person's when their components are verified. */
  fixture?: string;
  [key: string]: unknown;
};

/** An optional catalog of UI patterns the builder can search, such as the Pattern Atlas. */
export type CatalogPlugin = {
  /** One line for the builder's description of the pipeline, explaining what the catalog is and how components relate to it. */
  about: string;
  /** Usually `catalog_search` and `catalog_get`. */
  tools: Tool[];
};

export type MalleableConfig = {
  /** What the app is, for the prompts: "a university course-planning app for students and their advisors". */
  domain: string;
  /** Where the handler is mounted. Default `/api/malleable`. */
  basePath?: string;
  /** The builtin component definitions. */
  library: ComponentDef[];
  regions: Record<string, RegionConfig>;
  /** The profile the decider reads for people on the shared default. */
  profile?: string;
  rationale?: string[];
  /** Context key -> option key -> the description the decider reads. The browser only ever sends keys. */
  context?: Record<string, Record<string, string>>;
  /** Decides who a request is for. Return null to reject it. The user id is never read from the request otherwise. */
  authenticate(req: Request): string | null | Promise<string | null>;
  describeUser(userId: string): UserDescription | Promise<UserDescription>;
  kit?: KitConfig;
  design?: DesignContract;
  fixtures?: FixtureSet;
  decider: Decider;
  builder?: Builder;
  verifier?: Verifier;
  storage: Storage;
  catalog?: CatalogPlugin;
  /** Source of a builtin component, for the builder's read_component tool. */
  sources?: (id: string) => string | null | Promise<string | null>;
  prompts?: PromptSettings & {
    /** Extra guidance appended to every builder system prompt. */
    builder?: string;
  };
  thresholds?: Partial<Thresholds>;
  /** Who may promote a private generated component to everyone. Default: nobody. */
  canPromote?: (userId: string) => boolean | Promise<boolean>;
  /**
   * Called when a component is promoted. Return false to keep it private, for
   * example after opening a pull request that adds it as a builtin instead.
   */
  onPromote?: (component: ComponentDef, by: string) => boolean | void | Promise<boolean | void>;
};
