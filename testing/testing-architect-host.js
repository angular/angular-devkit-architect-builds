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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestingArchitectHost = void 0;
const src_1 = require("../src");
class TestingArchitectHost {
    /**
     * Can provide a backend host, in case of integration tests.
     * @param workspaceRoot The workspace root to use.
     * @param currentDirectory The current directory to use.
     * @param _backendHost A host to defer calls that aren't resolved here.
     */
    constructor(workspaceRoot = '', currentDirectory = workspaceRoot, _backendHost = null) {
        this.workspaceRoot = workspaceRoot;
        this.currentDirectory = currentDirectory;
        this._backendHost = _backendHost;
        this._builderImportMap = new Map();
        this._builderMap = new Map();
        this._targetMap = new Map();
    }
    addBuilder(builderName, builder, description = 'Testing only builder.', optionSchema = { type: 'object' }) {
        this._builderImportMap.set(builderName, builder);
        this._builderMap.set(builderName, { builderName, description, optionSchema });
    }
    async addBuilderFromPackage(packageName) {
        const packageJson = await Promise.resolve().then(() => __importStar(require(packageName + '/package.json')));
        if (!('builders' in packageJson)) {
            throw new Error('Invalid package.json, builders key not found.');
        }
        if (!packageJson.name) {
            throw new Error('Invalid package name');
        }
        const builderJsonPath = packageName + '/' + packageJson['builders'];
        const builderJson = await Promise.resolve().then(() => __importStar(require(builderJsonPath)));
        const builders = builderJson['builders'];
        if (!builders) {
            throw new Error('Invalid builders.json, builders key not found.');
        }
        for (const builderName of Object.keys(builders)) {
            const b = builders[builderName];
            // TODO: remove this check as v1 is not supported anymore.
            if (!b.implementation) {
                continue;
            }
            const handler = (await Promise.resolve().then(() => __importStar(require(builderJsonPath + '/../' + b.implementation)))).default;
            const optionsSchema = await Promise.resolve().then(() => __importStar(require(builderJsonPath + '/../' + b.schema)));
            this.addBuilder(`${packageJson.name}:${builderName}`, handler, b.description, optionsSchema);
        }
    }
    addTarget(target, builderName, options = {}) {
        this._targetMap.set((0, src_1.targetStringFromTarget)(target), { builderName, options });
    }
    async getBuilderNameForTarget(target) {
        const name = (0, src_1.targetStringFromTarget)(target);
        const maybeTarget = this._targetMap.get(name);
        if (!maybeTarget) {
            return this._backendHost && this._backendHost.getBuilderNameForTarget(target);
        }
        return maybeTarget.builderName;
    }
    /**
     * Resolve a builder. This needs to return a string which will be used in a dynamic `import()`
     * clause. This should throw if no builder can be found. The dynamic import will throw if
     * it is unsupported.
     * @param builderName The name of the builder to be used.
     * @returns All the info needed for the builder itself.
     */
    async resolveBuilder(builderName) {
        return (this._builderMap.get(builderName) ||
            (this._backendHost && this._backendHost.resolveBuilder(builderName)));
    }
    async getCurrentDirectory() {
        return this.currentDirectory;
    }
    async getWorkspaceRoot() {
        return this.workspaceRoot;
    }
    async getOptionsForTarget(target) {
        const name = (0, src_1.targetStringFromTarget)(target);
        const maybeTarget = this._targetMap.get(name);
        if (!maybeTarget) {
            return this._backendHost && this._backendHost.getOptionsForTarget(target);
        }
        return maybeTarget.options;
    }
    async getProjectMetadata(target) {
        return this._backendHost && this._backendHost.getProjectMetadata(target);
    }
    async loadBuilder(info) {
        return (this._builderImportMap.get(info.builderName) ||
            (this._backendHost && this._backendHost.loadBuilder(info)));
    }
}
exports.TestingArchitectHost = TestingArchitectHost;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZy1hcmNoaXRlY3QtaG9zdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2FyY2hpdGVjdC90ZXN0aW5nL3Rlc3RpbmctYXJjaGl0ZWN0LWhvc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUdILGdDQUFxRTtBQUdyRSxNQUFhLG9CQUFvQjtJQUsvQjs7Ozs7T0FLRztJQUNILFlBQ1MsZ0JBQWdCLEVBQUUsRUFDbEIsbUJBQW1CLGFBQWEsRUFDL0IsZUFBcUMsSUFBSTtRQUYxQyxrQkFBYSxHQUFiLGFBQWEsQ0FBSztRQUNsQixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQWdCO1FBQy9CLGlCQUFZLEdBQVosWUFBWSxDQUE2QjtRQWIzQyxzQkFBaUIsR0FBRyxJQUFJLEdBQUcsRUFBbUIsQ0FBQztRQUMvQyxnQkFBVyxHQUFHLElBQUksR0FBRyxFQUF1QixDQUFDO1FBQzdDLGVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBNkQsQ0FBQztJQVl2RixDQUFDO0lBRUosVUFBVSxDQUNSLFdBQW1CLEVBQ25CLE9BQWdCLEVBQ2hCLFdBQVcsR0FBRyx1QkFBdUIsRUFDckMsZUFBdUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO1FBRXpELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ2pELElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBQ0QsS0FBSyxDQUFDLHFCQUFxQixDQUFDLFdBQW1CO1FBQzdDLE1BQU0sV0FBVyxHQUFHLHdEQUFhLFdBQVcsR0FBRyxlQUFlLEdBQUMsQ0FBQztRQUNoRSxJQUFJLENBQUMsQ0FBQyxVQUFVLElBQUksV0FBVyxDQUFDLEVBQUU7WUFDaEMsTUFBTSxJQUFJLEtBQUssQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDO1NBQ2xFO1FBRUQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUU7WUFDckIsTUFBTSxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1NBQ3pDO1FBRUQsTUFBTSxlQUFlLEdBQUcsV0FBVyxHQUFHLEdBQUcsR0FBRyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDcEUsTUFBTSxXQUFXLEdBQUcsd0RBQWEsZUFBZSxHQUFDLENBQUM7UUFDbEQsTUFBTSxRQUFRLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxRQUFRLEVBQUU7WUFDYixNQUFNLElBQUksS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7U0FDbkU7UUFFRCxLQUFLLE1BQU0sV0FBVyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDL0MsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ2hDLDBEQUEwRDtZQUMxRCxJQUFJLENBQUMsQ0FBQyxDQUFDLGNBQWMsRUFBRTtnQkFDckIsU0FBUzthQUNWO1lBQ0QsTUFBTSxPQUFPLEdBQUcsQ0FBQyx3REFBYSxlQUFlLEdBQUcsTUFBTSxHQUFHLENBQUMsQ0FBQyxjQUFjLEdBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztZQUNwRixNQUFNLGFBQWEsR0FBRyx3REFBYSxlQUFlLEdBQUcsTUFBTSxHQUFHLENBQUMsQ0FBQyxNQUFNLEdBQUMsQ0FBQztZQUN4RSxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsV0FBVyxDQUFDLElBQUksSUFBSSxXQUFXLEVBQUUsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLFdBQVcsRUFBRSxhQUFhLENBQUMsQ0FBQztTQUM5RjtJQUNILENBQUM7SUFDRCxTQUFTLENBQUMsTUFBYyxFQUFFLFdBQW1CLEVBQUUsVUFBMkIsRUFBRTtRQUMxRSxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFBLDRCQUFzQixFQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsV0FBVyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDaEYsQ0FBQztJQUVELEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxNQUFjO1FBQzFDLE1BQU0sSUFBSSxHQUFHLElBQUEsNEJBQXNCLEVBQUMsTUFBTSxDQUFDLENBQUM7UUFDNUMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDOUMsSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNoQixPQUFPLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUMvRTtRQUVELE9BQU8sV0FBVyxDQUFDLFdBQVcsQ0FBQztJQUNqQyxDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0gsS0FBSyxDQUFDLGNBQWMsQ0FBQyxXQUFtQjtRQUN0QyxPQUFPLENBQ0wsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDO1lBQ2pDLENBQUMsSUFBSSxDQUFDLFlBQVksSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUNyRSxDQUFDO0lBQ0osQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUI7UUFDdkIsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUM7SUFDL0IsQ0FBQztJQUNELEtBQUssQ0FBQyxnQkFBZ0I7UUFDcEIsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDO0lBQzVCLENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CLENBQUMsTUFBYztRQUN0QyxNQUFNLElBQUksR0FBRyxJQUFBLDRCQUFzQixFQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlDLElBQUksQ0FBQyxXQUFXLEVBQUU7WUFDaEIsT0FBTyxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLENBQUM7U0FDM0U7UUFFRCxPQUFPLFdBQVcsQ0FBQyxPQUFPLENBQUM7SUFDN0IsQ0FBQztJQUVELEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxNQUF1QjtRQUM5QyxPQUFPLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFnQixDQUFDLENBQUM7SUFDckYsQ0FBQztJQUVELEtBQUssQ0FBQyxXQUFXLENBQUMsSUFBaUI7UUFDakMsT0FBTyxDQUNMLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQztZQUM1QyxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FDM0QsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQTdHRCxvREE2R0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0IHsganNvbiB9IGZyb20gJ0Bhbmd1bGFyLWRldmtpdC9jb3JlJztcbmltcG9ydCB7IEJ1aWxkZXJJbmZvLCBUYXJnZXQsIHRhcmdldFN0cmluZ0Zyb21UYXJnZXQgfSBmcm9tICcuLi9zcmMnO1xuaW1wb3J0IHsgQXJjaGl0ZWN0SG9zdCwgQnVpbGRlciB9IGZyb20gJy4uL3NyYy9pbnRlcm5hbCc7XG5cbmV4cG9ydCBjbGFzcyBUZXN0aW5nQXJjaGl0ZWN0SG9zdCBpbXBsZW1lbnRzIEFyY2hpdGVjdEhvc3Qge1xuICBwcml2YXRlIF9idWlsZGVySW1wb3J0TWFwID0gbmV3IE1hcDxzdHJpbmcsIEJ1aWxkZXI+KCk7XG4gIHByaXZhdGUgX2J1aWxkZXJNYXAgPSBuZXcgTWFwPHN0cmluZywgQnVpbGRlckluZm8+KCk7XG4gIHByaXZhdGUgX3RhcmdldE1hcCA9IG5ldyBNYXA8c3RyaW5nLCB7IGJ1aWxkZXJOYW1lOiBzdHJpbmc7IG9wdGlvbnM6IGpzb24uSnNvbk9iamVjdCB9PigpO1xuXG4gIC8qKlxuICAgKiBDYW4gcHJvdmlkZSBhIGJhY2tlbmQgaG9zdCwgaW4gY2FzZSBvZiBpbnRlZ3JhdGlvbiB0ZXN0cy5cbiAgICogQHBhcmFtIHdvcmtzcGFjZVJvb3QgVGhlIHdvcmtzcGFjZSByb290IHRvIHVzZS5cbiAgICogQHBhcmFtIGN1cnJlbnREaXJlY3RvcnkgVGhlIGN1cnJlbnQgZGlyZWN0b3J5IHRvIHVzZS5cbiAgICogQHBhcmFtIF9iYWNrZW5kSG9zdCBBIGhvc3QgdG8gZGVmZXIgY2FsbHMgdGhhdCBhcmVuJ3QgcmVzb2x2ZWQgaGVyZS5cbiAgICovXG4gIGNvbnN0cnVjdG9yKFxuICAgIHB1YmxpYyB3b3Jrc3BhY2VSb290ID0gJycsXG4gICAgcHVibGljIGN1cnJlbnREaXJlY3RvcnkgPSB3b3Jrc3BhY2VSb290LFxuICAgIHByaXZhdGUgX2JhY2tlbmRIb3N0OiBBcmNoaXRlY3RIb3N0IHwgbnVsbCA9IG51bGwsXG4gICkge31cblxuICBhZGRCdWlsZGVyKFxuICAgIGJ1aWxkZXJOYW1lOiBzdHJpbmcsXG4gICAgYnVpbGRlcjogQnVpbGRlcixcbiAgICBkZXNjcmlwdGlvbiA9ICdUZXN0aW5nIG9ubHkgYnVpbGRlci4nLFxuICAgIG9wdGlvblNjaGVtYToganNvbi5zY2hlbWEuSnNvblNjaGVtYSA9IHsgdHlwZTogJ29iamVjdCcgfSxcbiAgKSB7XG4gICAgdGhpcy5fYnVpbGRlckltcG9ydE1hcC5zZXQoYnVpbGRlck5hbWUsIGJ1aWxkZXIpO1xuICAgIHRoaXMuX2J1aWxkZXJNYXAuc2V0KGJ1aWxkZXJOYW1lLCB7IGJ1aWxkZXJOYW1lLCBkZXNjcmlwdGlvbiwgb3B0aW9uU2NoZW1hIH0pO1xuICB9XG4gIGFzeW5jIGFkZEJ1aWxkZXJGcm9tUGFja2FnZShwYWNrYWdlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcGFja2FnZUpzb24gPSBhd2FpdCBpbXBvcnQocGFja2FnZU5hbWUgKyAnL3BhY2thZ2UuanNvbicpO1xuICAgIGlmICghKCdidWlsZGVycycgaW4gcGFja2FnZUpzb24pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgcGFja2FnZS5qc29uLCBidWlsZGVycyBrZXkgbm90IGZvdW5kLicpO1xuICAgIH1cblxuICAgIGlmICghcGFja2FnZUpzb24ubmFtZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHBhY2thZ2UgbmFtZScpO1xuICAgIH1cblxuICAgIGNvbnN0IGJ1aWxkZXJKc29uUGF0aCA9IHBhY2thZ2VOYW1lICsgJy8nICsgcGFja2FnZUpzb25bJ2J1aWxkZXJzJ107XG4gICAgY29uc3QgYnVpbGRlckpzb24gPSBhd2FpdCBpbXBvcnQoYnVpbGRlckpzb25QYXRoKTtcbiAgICBjb25zdCBidWlsZGVycyA9IGJ1aWxkZXJKc29uWydidWlsZGVycyddO1xuICAgIGlmICghYnVpbGRlcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBidWlsZGVycy5qc29uLCBidWlsZGVycyBrZXkgbm90IGZvdW5kLicpO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgYnVpbGRlck5hbWUgb2YgT2JqZWN0LmtleXMoYnVpbGRlcnMpKSB7XG4gICAgICBjb25zdCBiID0gYnVpbGRlcnNbYnVpbGRlck5hbWVdO1xuICAgICAgLy8gVE9ETzogcmVtb3ZlIHRoaXMgY2hlY2sgYXMgdjEgaXMgbm90IHN1cHBvcnRlZCBhbnltb3JlLlxuICAgICAgaWYgKCFiLmltcGxlbWVudGF0aW9uKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgaGFuZGxlciA9IChhd2FpdCBpbXBvcnQoYnVpbGRlckpzb25QYXRoICsgJy8uLi8nICsgYi5pbXBsZW1lbnRhdGlvbikpLmRlZmF1bHQ7XG4gICAgICBjb25zdCBvcHRpb25zU2NoZW1hID0gYXdhaXQgaW1wb3J0KGJ1aWxkZXJKc29uUGF0aCArICcvLi4vJyArIGIuc2NoZW1hKTtcbiAgICAgIHRoaXMuYWRkQnVpbGRlcihgJHtwYWNrYWdlSnNvbi5uYW1lfToke2J1aWxkZXJOYW1lfWAsIGhhbmRsZXIsIGIuZGVzY3JpcHRpb24sIG9wdGlvbnNTY2hlbWEpO1xuICAgIH1cbiAgfVxuICBhZGRUYXJnZXQodGFyZ2V0OiBUYXJnZXQsIGJ1aWxkZXJOYW1lOiBzdHJpbmcsIG9wdGlvbnM6IGpzb24uSnNvbk9iamVjdCA9IHt9KSB7XG4gICAgdGhpcy5fdGFyZ2V0TWFwLnNldCh0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0KHRhcmdldCksIHsgYnVpbGRlck5hbWUsIG9wdGlvbnMgfSk7XG4gIH1cblxuICBhc3luYyBnZXRCdWlsZGVyTmFtZUZvclRhcmdldCh0YXJnZXQ6IFRhcmdldCk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIGNvbnN0IG5hbWUgPSB0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0KHRhcmdldCk7XG4gICAgY29uc3QgbWF5YmVUYXJnZXQgPSB0aGlzLl90YXJnZXRNYXAuZ2V0KG5hbWUpO1xuICAgIGlmICghbWF5YmVUYXJnZXQpIHtcbiAgICAgIHJldHVybiB0aGlzLl9iYWNrZW5kSG9zdCAmJiB0aGlzLl9iYWNrZW5kSG9zdC5nZXRCdWlsZGVyTmFtZUZvclRhcmdldCh0YXJnZXQpO1xuICAgIH1cblxuICAgIHJldHVybiBtYXliZVRhcmdldC5idWlsZGVyTmFtZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNvbHZlIGEgYnVpbGRlci4gVGhpcyBuZWVkcyB0byByZXR1cm4gYSBzdHJpbmcgd2hpY2ggd2lsbCBiZSB1c2VkIGluIGEgZHluYW1pYyBgaW1wb3J0KClgXG4gICAqIGNsYXVzZS4gVGhpcyBzaG91bGQgdGhyb3cgaWYgbm8gYnVpbGRlciBjYW4gYmUgZm91bmQuIFRoZSBkeW5hbWljIGltcG9ydCB3aWxsIHRocm93IGlmXG4gICAqIGl0IGlzIHVuc3VwcG9ydGVkLlxuICAgKiBAcGFyYW0gYnVpbGRlck5hbWUgVGhlIG5hbWUgb2YgdGhlIGJ1aWxkZXIgdG8gYmUgdXNlZC5cbiAgICogQHJldHVybnMgQWxsIHRoZSBpbmZvIG5lZWRlZCBmb3IgdGhlIGJ1aWxkZXIgaXRzZWxmLlxuICAgKi9cbiAgYXN5bmMgcmVzb2x2ZUJ1aWxkZXIoYnVpbGRlck5hbWU6IHN0cmluZyk6IFByb21pc2U8QnVpbGRlckluZm8gfCBudWxsPiB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuX2J1aWxkZXJNYXAuZ2V0KGJ1aWxkZXJOYW1lKSB8fFxuICAgICAgKHRoaXMuX2JhY2tlbmRIb3N0ICYmIHRoaXMuX2JhY2tlbmRIb3N0LnJlc29sdmVCdWlsZGVyKGJ1aWxkZXJOYW1lKSlcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgZ2V0Q3VycmVudERpcmVjdG9yeSgpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIHJldHVybiB0aGlzLmN1cnJlbnREaXJlY3Rvcnk7XG4gIH1cbiAgYXN5bmMgZ2V0V29ya3NwYWNlUm9vdCgpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIHJldHVybiB0aGlzLndvcmtzcGFjZVJvb3Q7XG4gIH1cblxuICBhc3luYyBnZXRPcHRpb25zRm9yVGFyZ2V0KHRhcmdldDogVGFyZ2V0KTogUHJvbWlzZTxqc29uLkpzb25PYmplY3QgfCBudWxsPiB7XG4gICAgY29uc3QgbmFtZSA9IHRhcmdldFN0cmluZ0Zyb21UYXJnZXQodGFyZ2V0KTtcbiAgICBjb25zdCBtYXliZVRhcmdldCA9IHRoaXMuX3RhcmdldE1hcC5nZXQobmFtZSk7XG4gICAgaWYgKCFtYXliZVRhcmdldCkge1xuICAgICAgcmV0dXJuIHRoaXMuX2JhY2tlbmRIb3N0ICYmIHRoaXMuX2JhY2tlbmRIb3N0LmdldE9wdGlvbnNGb3JUYXJnZXQodGFyZ2V0KTtcbiAgICB9XG5cbiAgICByZXR1cm4gbWF5YmVUYXJnZXQub3B0aW9ucztcbiAgfVxuXG4gIGFzeW5jIGdldFByb2plY3RNZXRhZGF0YSh0YXJnZXQ6IFRhcmdldCB8IHN0cmluZyk6IFByb21pc2U8anNvbi5Kc29uT2JqZWN0IHwgbnVsbD4ge1xuICAgIHJldHVybiB0aGlzLl9iYWNrZW5kSG9zdCAmJiB0aGlzLl9iYWNrZW5kSG9zdC5nZXRQcm9qZWN0TWV0YWRhdGEodGFyZ2V0IGFzIHN0cmluZyk7XG4gIH1cblxuICBhc3luYyBsb2FkQnVpbGRlcihpbmZvOiBCdWlsZGVySW5mbyk6IFByb21pc2U8QnVpbGRlciB8IG51bGw+IHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5fYnVpbGRlckltcG9ydE1hcC5nZXQoaW5mby5idWlsZGVyTmFtZSkgfHxcbiAgICAgICh0aGlzLl9iYWNrZW5kSG9zdCAmJiB0aGlzLl9iYWNrZW5kSG9zdC5sb2FkQnVpbGRlcihpbmZvKSlcbiAgICApO1xuICB9XG59XG4iXX0=