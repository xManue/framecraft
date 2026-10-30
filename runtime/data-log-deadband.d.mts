export interface DataLogDeadband { mode: "none" | "absolute" | "percentage"; value: number }
export function dataLogDeadbandValid(value: unknown): value is DataLogDeadband;
export function effectiveDataLogDeadband(log: { deadband?: DataLogDeadband }, tag: { mode: string; deadband?: DataLogDeadband }): DataLogDeadband | undefined;
export function dataLogDeadbandAllows(previous: string | undefined, current: string, policy?: DataLogDeadband): boolean;
