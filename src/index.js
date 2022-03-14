"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBuilder = exports.Architect = void 0;
__exportStar(require("./api"), exports);
var architect_1 = require("./architect");
Object.defineProperty(exports, "Architect", { enumerable: true, get: function () { return architect_1.Architect; } });
var create_builder_1 = require("./create-builder");
Object.defineProperty(exports, "createBuilder", { enumerable: true, get: function () { return create_builder_1.createBuilder; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyX2RldmtpdC9hcmNoaXRlY3Qvc3JjL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7Ozs7QUFFSCx3Q0FBc0I7QUFDdEIseUNBQXlEO0FBQWhELHNHQUFBLFNBQVMsT0FBQTtBQUNsQixtREFBaUQ7QUFBeEMsK0dBQUEsYUFBYSxPQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmV4cG9ydCAqIGZyb20gJy4vYXBpJztcbmV4cG9ydCB7IEFyY2hpdGVjdCwgU2NoZWR1bGVPcHRpb25zIH0gZnJvbSAnLi9hcmNoaXRlY3QnO1xuZXhwb3J0IHsgY3JlYXRlQnVpbGRlciB9IGZyb20gJy4vY3JlYXRlLWJ1aWxkZXInO1xuIl19