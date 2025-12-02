declare namespace NodeJS {
  // Minimal env typing to satisfy the linter in this environment
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
}

// eslint-disable-next-line no-var
declare var process: NodeJS.Process;

// Module shims for environments without @types packages installed
declare module "dotenv";
declare module "axios";