import { DatabaseTypes } from 'repo-depkit-common';
import { MyDatabaseHelper } from './MyDatabaseHelper';
import { WorkflowRunLogger } from '../workflows-runs-hook/WorkflowRunJobInterface';

/**
 * Bundles commonly used objects when running a workflow.
 */
export class WorkflowRunContext {
  constructor(
    public readonly workflowRun: DatabaseTypes.WorkflowsRuns,
    public readonly myDatabaseHelper: MyDatabaseHelper,
    public readonly logger: WorkflowRunLogger
  ) {}
}

export type WorkflowRunDependencies = WorkflowRunContext;
