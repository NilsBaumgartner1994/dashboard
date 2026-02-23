// Lokale Typdeklarationen für node-cron, falls @types/node-cron nicht gefunden wird
declare module 'node-cron' {
  export type ScheduledTask = {
    start: () => void;
    stop: () => void;
    destroy?: () => void;
    getStatus?: () => string;
  };

  export function schedule(expression: string, fn: () => void | Promise<void>, options?: { scheduled?: boolean }): ScheduledTask;
  export function validate(expression: string): boolean;

  const _default: {
    schedule: typeof schedule;
    validate: typeof validate;
  };

  export default _default;
}

