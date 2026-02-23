export enum WORKFLOW_RUN_STATE {
  RUNNING = 'running', // ein workflow run wird gerade ausgeführt, in der regel nur einer pro workflow
  SUCCESS = 'success',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  DELETE = 'delete',
}
