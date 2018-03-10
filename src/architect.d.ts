/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { BaseException, Path, virtualFs } from '@angular-devkit/core';
import { Observable } from 'rxjs/Observable';
import { BuildEvent, Builder, BuilderContext, BuilderDescription } from './builder';
import { Workspace } from './workspace';
export declare class ProjectNotFoundException extends BaseException {
    constructor(name?: string);
}
export declare class TargetNotFoundException extends BaseException {
    constructor(name?: string);
}
export declare class ConfigurationNotFoundException extends BaseException {
    constructor(name: string);
}
export declare class SchemaValidationException extends BaseException {
    constructor(errors: string[]);
}
export declare class BuilderCannotBeResolvedException extends BaseException {
    constructor(builder: string);
}
export declare class WorkspaceNotYetLoadedException extends BaseException {
    constructor();
}
export declare class BuilderNotFoundException extends BaseException {
    constructor(builder: string);
}
export interface Target<OptionsT = {}> {
    root: Path;
    projectType: string;
    builder: string;
    options: OptionsT;
}
export interface TargetOptions<OptionsT = {}> {
    project?: string;
    target?: string;
    configuration?: string;
    overrides?: Partial<OptionsT>;
}
export declare class Architect {
    private _root;
    private _host;
    private readonly _workspaceSchemaPath;
    private readonly _buildersSchemaPath;
    private _workspaceSchema;
    private _buildersSchema;
    private _architectSchemasLoaded;
    private _builderPathsMap;
    private _builderDescriptionMap;
    private _builderConstructorMap;
    private _workspace;
    constructor(_root: Path, _host: virtualFs.Host<{}>);
    loadWorkspaceFromHost(workspacePath: Path): Observable<this>;
    loadWorkspaceFromJson(json: Workspace): Observable<this>;
    private _loadArchitectSchemas();
    getTarget<OptionsT>(options?: TargetOptions): Target<OptionsT>;
    run<OptionsT>(target: Target<OptionsT>, partialContext?: Partial<BuilderContext>): Observable<BuildEvent>;
    getBuilderDescription<OptionsT>(target: Target<OptionsT>): Observable<BuilderDescription>;
    validateBuilderOptions<OptionsT>(target: Target<OptionsT>, builderDescription: BuilderDescription): Observable<OptionsT>;
    getBuilder<OptionsT>(builderDescription: BuilderDescription, context: BuilderContext): Builder<OptionsT>;
    private _validateAgainstSchema<T>(contentJson, schemaJson);
    private _loadJsonFile(path);
}
