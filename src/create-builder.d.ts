/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */
import { json } from '@angular-devkit/core';
import { BuilderHandlerFn, BuilderOutput } from './api';
import { Builder } from './internal';
export type { Builder };
export declare function createBuilder<OptT = json.JsonObject, OutT extends BuilderOutput = BuilderOutput>(fn: BuilderHandlerFn<OptT>): Builder<OptT & json.JsonObject>;
