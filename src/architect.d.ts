/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { experimental, json, logging } from '@angular-devkit/core';
import { Observable } from 'rxjs';
import { BuilderInfo, BuilderInput, BuilderOutput, BuilderRegistry, BuilderRun, Target } from './api';
import { ArchitectHost, BuilderJobHandler } from './internal';
export interface ScheduleOptions {
    logger?: logging.Logger;
}
/**
 * A JobRegistry that resolves builder targets from the host.
 */
export declare class ArchitectBuilderJobRegistry implements BuilderRegistry {
    protected _host: ArchitectHost;
    protected _registry: json.schema.SchemaRegistry;
    protected _jobCache?: Map<string, Observable<BuilderJobHandler<json.JsonObject, BuilderInput, BuilderOutput> | null>> | undefined;
    protected _infoCache?: Map<string, Observable<BuilderInfo | null>> | undefined;
    constructor(_host: ArchitectHost, _registry: json.schema.SchemaRegistry, _jobCache?: Map<string, Observable<BuilderJobHandler<json.JsonObject, BuilderInput, BuilderOutput> | null>> | undefined, _infoCache?: Map<string, Observable<BuilderInfo | null>> | undefined);
    protected _resolveBuilder(name: string): Observable<BuilderInfo | null>;
    protected _createBuilder(info: BuilderInfo, target?: Target, options?: json.JsonObject): Observable<BuilderJobHandler | null>;
    get<A extends json.JsonObject, I extends BuilderInput, O extends BuilderOutput>(name: string): Observable<experimental.jobs.JobHandler<A, I, O> | null>;
}
/**
 * A JobRegistry that resolves targets from the host.
 */
export declare class ArchitectTargetJobRegistry extends ArchitectBuilderJobRegistry {
    get<A extends json.JsonObject, I extends BuilderInput, O extends BuilderOutput>(name: string): Observable<experimental.jobs.JobHandler<A, I, O> | null>;
}
export declare class Architect {
    private _host;
    private _registry;
    private readonly _scheduler;
    private readonly _jobCache;
    private readonly _infoCache;
    constructor(_host: ArchitectHost, _registry?: json.schema.SchemaRegistry, additionalJobRegistry?: experimental.jobs.Registry);
    has(name: experimental.jobs.JobName): Observable<boolean>;
    scheduleBuilder(name: string, options: json.JsonObject, scheduleOptions?: ScheduleOptions): Promise<BuilderRun>;
    scheduleTarget(target: Target, overrides?: json.JsonObject, scheduleOptions?: ScheduleOptions): Promise<BuilderRun>;
}
