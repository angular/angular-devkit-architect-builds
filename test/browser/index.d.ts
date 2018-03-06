/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { Observable } from 'rxjs/Observable';
import { BuildEvent, Builder, Target } from '../../src';
export interface BrowserTargetOptions {
    browserOption: number;
    optimizationLevel: number;
}
export default class BrowserTarget implements Builder<BrowserTargetOptions> {
    run(_info: Target<Partial<BrowserTargetOptions>>): Observable<BuildEvent>;
}
